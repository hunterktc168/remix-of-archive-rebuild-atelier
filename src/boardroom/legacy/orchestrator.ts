// @ts-nocheck
/* Ported verbatim from the original Boardroom vanilla JS app; see src/boardroom/AGENTS.md. */
/**
 * Boardroom Multi-Agent & Single-Agent Deliberation Orchestrator
 * Pure Vanilla ES Module — Zero dependencies
 *
 * Implements:
 * 1. Single-Agent 1:1 Direct Chat:
 *    - Scoped thread persistence with agentId = target.
 *    - Streams chunks into live-rendering bubble with AbortController support.
 *    - Persists final agent message with meta: { model, provider, timestamp }.
 *    - Regenerate replaces the last agent message for that agent+phase.
 * 2. Multi-Agent Boardroom Chamber Deliberation:
 *    - Sequenced multi-agent roundtable with customizable participant list & speaking order.
 *    - Context chaining: builds system prompts passing structured priorAgentReplies.
 *    - Real-time in-session controls: pause after current speaker, stop, skip to Chair summary.
 *    - Non-fatal per-speaker error recovery (marks speaker as errored and continues).
 *    - Automatic Chair "Round summary": 3 agreements, 2 disagreements, 1 next action.
 *    - Challenge claim with David (Validation Partner inline interrogation).
 *    - Per-speaker retry in round.
 * 3. Milestone Deliverable Synthesis with The Chair.
 */

import { stream, getProvider } from './llm';
import {
  getAgent,
  THE_CHAIR,
  PHASE_AGENTS,
  DEFAULT_AGENTS,
  buildChairRoundSummaryPrompt,
  buildDavidChallengePrompt
} from './agents';
import { getAll, put, saveVenture } from './db';

/**
 * Derive a clean, concise round title from founder's prompt
 */
export function deriveSessionTitle(text = '') {
  const cleaned = text
    .replace(/^["']|["']$/g, '')
    .replace(/[#*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Strategic Deliberation Round';

  // Extract first sentence or up to 60 characters
  const firstSentence = cleaned.split(/[.?!]\s/)[0];
  const words = firstSentence.split(' ');

  if (words.length <= 8) {
    return firstSentence.length > 55 ? firstSentence.slice(0, 52) + '...' : firstSentence;
  }

  const shortSlice = words.slice(0, 7).join(' ');
  return shortSlice.length > 50 ? shortSlice.slice(0, 47) + '...' : shortSlice + '...';
}

/**
 * Execute 1:1 Direct Chat with a Specific Board Member
 */
export async function singleAgentChat({
  venture,
  phase,
  text,
  targetAgentId,
  session,
  onMessageStart,
  onChunk,
  onMessageDone,
  onAgentSpeakingChange,
  signal
}) {
  const agent = getAgent(targetAgentId) || DEFAULT_AGENTS[0];

  // 1. Persist the user message (agentId = target)
  const userMsg = {
    id: `m_${Date.now()}_u`,
    author: 'Founder',
    role: 'user',
    agentId: agent.id,
    text: text,
    timestamp: Date.now()
  };

  session.messages = session.messages || [];
  session.messages.push(userMsg);
  session.updatedAt = Date.now();
  await put('sessions', session);

  // 2. Prepare 1:1 Context:
  const trimmedTranscript = session.messages.slice(-12);

  const systemPrompt = typeof agent.systemPromptTemplate === 'function'
    ? agent.systemPromptTemplate({
        venture,
        phase: phase.id,
        transcript: trimmedTranscript,
        priorAgentReplies: [],
        deliverable: null,
        deliverableType: phase.deliverableType
      })
    : `You are ${agent.name}, ${agent.role}. Advise the founder directly.`;

  const messages = trimmedTranscript.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text
  }));

  // 3. Create agent placeholder message
  const agentMsg = {
    id: `m_${Date.now()}_${agent.id}`,
    author: agent.name,
    agentId: agent.id,
    role: agent.shortRole,
    text: '',
    timestamp: Date.now(),
    meta: null
  };

  session.messages.push(agentMsg);
  session.updatedAt = Date.now();

  if (onAgentSpeakingChange) onAgentSpeakingChange(agent.id, true);
  if (onMessageStart) onMessageStart(agentMsg);

  try {
    const streamGen = stream({
      system: systemPrompt,
      messages,
      signal,
      meta: {
        agentId: agent.id,
        action: 'chat',
        venture,
        phase: phase.label,
        founderText: text
      }
    });

    for await (const chunk of streamGen) {
      if (signal && signal.aborted) break;
      agentMsg.text += chunk;
      if (onChunk) onChunk(agentMsg.id, agentMsg.text);
    }
  } catch (err) {
    if (signal?.aborted || err.name === 'AbortError') {
      if (!agentMsg.text) {
        agentMsg.text = '*[Direct chat interrupted by founder]*';
      } else {
        agentMsg.text += ' *[Interrupted]*';
      }
      if (onChunk) onChunk(agentMsg.id, agentMsg.text);
    } else {
      if (!agentMsg.text) {
        session.messages.pop();
        await put('sessions', session);
      }
      if (onAgentSpeakingChange) onAgentSpeakingChange(agent.id, false);
      throw err;
    }
  }

  // 4. Attach metadata and persist
  const provider = await getProvider();
  agentMsg.meta = {
    provider: provider.name,
    model: provider.model || (provider.name === 'mock' ? 'deterministic-sim' : 'default'),
    timestamp: Date.now()
  };

  await put('sessions', session);

  if (onMessageDone) onMessageDone(agentMsg);
  if (onAgentSpeakingChange) onAgentSpeakingChange(agent.id, false);

  return { userMsg, agentMsg, session };
}

/**
 * Regenerate the last agent reply in a 1:1 single-agent thread
 */
export async function regenerateLastAgentReply({
  venture,
  phase,
  targetAgentId,
  session,
  onMessageStart,
  onChunk,
  onMessageDone,
  onAgentSpeakingChange,
  signal
}) {
  const agent = getAgent(targetAgentId) || DEFAULT_AGENTS[0];
  const msgs = session.messages || [];

  let lastAgentIdx = -1;
  let lastUserMsg = null;

  for (let i = msgs.length - 1; i >= 0; i--) {
    if (lastAgentIdx === -1 && msgs[i].agentId === agent.id && msgs[i].role !== 'user') {
      lastAgentIdx = i;
    } else if (lastAgentIdx !== -1 && (msgs[i].role === 'user' || msgs[i].author === 'Founder')) {
      lastUserMsg = msgs[i];
      break;
    }
  }

  const previousReplyIdx = lastAgentIdx;
  const previousReply = lastAgentIdx !== -1 ? msgs[lastAgentIdx] : null;

  if (lastAgentIdx !== -1) {
    msgs.splice(lastAgentIdx, 1);
  }

  const promptText = lastUserMsg ? lastUserMsg.text : `Provide your analytical assessment for ${venture.name}.`;
  const trimmedTranscript = msgs.slice(-12);

  const systemPrompt = typeof agent.systemPromptTemplate === 'function'
    ? agent.systemPromptTemplate({
        venture,
        phase: phase.id,
        transcript: trimmedTranscript,
        priorAgentReplies: [],
        deliverable: null,
        deliverableType: phase.deliverableType
      })
    : `You are ${agent.name}, ${agent.role}. Advise the founder directly.`;

  const messages = trimmedTranscript.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text
  }));

  const agentMsg = {
    id: `m_${Date.now()}_${agent.id}`,
    author: agent.name,
    agentId: agent.id,
    role: agent.shortRole,
    text: '',
    timestamp: Date.now(),
    meta: null
  };

  msgs.push(agentMsg);
  session.messages = msgs;
  session.updatedAt = Date.now();

  if (onAgentSpeakingChange) onAgentSpeakingChange(agent.id, true);
  if (onMessageStart) onMessageStart(agentMsg);

  try {
    const streamGen = stream({
      system: systemPrompt,
      messages,
      signal,
      meta: {
        agentId: agent.id,
        action: 'chat',
        venture,
        phase: phase.label,
        founderText: promptText
      }
    });

    for await (const chunk of streamGen) {
      if (signal && signal.aborted) break;
      agentMsg.text += chunk;
      if (onChunk) onChunk(agentMsg.id, agentMsg.text);
    }
  } catch (err) {
    if (signal?.aborted || err.name === 'AbortError') {
      if (!agentMsg.text) agentMsg.text = '*[Regeneration interrupted]*';
      if (onChunk) onChunk(agentMsg.id, agentMsg.text);
    } else {
      if (!agentMsg.text) {
        // Roll back the empty placeholder and restore the previous reply so a failed
        // regeneration never destroys the existing answer.
        const placeholderIdx = session.messages.indexOf(agentMsg);
        if (placeholderIdx !== -1) session.messages.splice(placeholderIdx, 1);
        if (previousReply) session.messages.splice(previousReplyIdx, 0, previousReply);
        await put('sessions', session);
      }
      if (onAgentSpeakingChange) onAgentSpeakingChange(agent.id, false);
      throw err;
    }
  }

  const provider = await getProvider();
  agentMsg.meta = {
    provider: provider.name,
    model: provider.model || (provider.name === 'mock' ? 'deterministic-sim' : 'default'),
    timestamp: Date.now()
  };

  await put('sessions', session);

  if (onMessageDone) onMessageDone(agentMsg);
  if (onAgentSpeakingChange) onAgentSpeakingChange(agent.id, false);

  return { agentMsg, session };
}

/**
 * Convene a sequenced multi-agent deliberation round across selected board members
 * Features:
 * - Dynamic speaking order and participant selection
 * - Real-time sessionControl: pause, resume, stop, skipToChair
 * - Non-fatal per-speaker error handling with inline retry support
 * - Dynamic context chaining with priorAgentReplies array
 * - Automated Chair "Round summary" synthesis
 */
export async function conveneDeliberationRound({
  venture,
  phase,
  text,
  participants = null,
  session,
  sessionControl = { pauseAfterCurrent: false, isStopped: false, skipToChair: false },
  onSessionStart,
  onSpeakerStart,
  onChunk,
  onSpeakerDone,
  onSpeakerError,
  onAgentSpeakingChange,
  onProgress,
  signal
}) {
  // 1. Identify which agents will participate and speaking order
  const storedAgents = await getAll('agents');
  const roster = (storedAgents && storedAgents.length > 0) ? storedAgents : DEFAULT_AGENTS;

  let activeParticipants = [];

  if (Array.isArray(participants) && participants.length > 0) {
    activeParticipants = participants
      .map(p => (typeof p === 'string' ? (roster.find(a => a.id === p) || getAgent(p)) : p))
      .filter(Boolean)
      .filter(a => a.enabled !== false && a.id !== 'chair');
  }

  if (activeParticipants.length === 0) {
    const allowedIds = PHASE_AGENTS[phase.id] || ['maya', 'sam', 'david'];
    activeParticipants = roster.filter(a => a.enabled && allowedIds.includes(a.id));
  }

  // 2. Initialize Round Record
  const roundId = `round_${Date.now()}`;
  const roundTitle = deriveSessionTitle(text);

  const userMsg = {
    id: `m_${Date.now()}_u`,
    roundId,
    author: 'Founder',
    role: 'user',
    text: text,
    timestamp: Date.now()
  };

  session.messages = session.messages || [];
  session.messages.push(userMsg);

  session.rounds = session.rounds || [];
  const roundRecord = {
    id: roundId,
    title: roundTitle,
    founderPrompt: text,
    startedAt: Date.now(),
    completedAt: null,
    participantIds: activeParticipants.map(a => a.id),
    participantCount: activeParticipants.length
  };
  session.rounds.push(roundRecord);
  session.updatedAt = Date.now();
  await put('sessions', session);

  if (onSessionStart) {
    onSessionStart({ roundId, roundTitle, participants: activeParticipants });
  }

  const priorAgentReplies = []; // Array of { agentName, shortRole, content }

  // 3. Sequentially iterate through active directors
  for (let i = 0; i < activeParticipants.length; i++) {
    // Check stop or abort signal
    if (signal?.aborted || sessionControl?.isStopped) {
      break;
    }

    // Check if founder requested to skip straight to Chair summary
    if (sessionControl?.skipToChair) {
      break;
    }

    // Handle "Pause after current speaker"
    while (sessionControl?.pauseAfterCurrent && !sessionControl?.isStopped && !signal?.aborted && !sessionControl?.skipToChair) {
      await new Promise(r => setTimeout(r, 200));
    }

    if (signal?.aborted || sessionControl?.isStopped) {
      break;
    }
    if (sessionControl?.skipToChair) {
      break;
    }

    const agent = activeParticipants[i];
    const fullAgentDef = getAgent(agent.id) || agent;

    if (onProgress) {
      onProgress({
        roundId,
        current: i + 1,
        total: activeParticipants.length,
        agentName: fullAgentDef.name,
        agentId: fullAgentDef.id
      });
    }

    if (onAgentSpeakingChange) {
      onAgentSpeakingChange(fullAgentDef.id, true);
    }

    const agentMsg = {
      id: `m_${Date.now()}_${fullAgentDef.id}`,
      roundId,
      author: fullAgentDef.name,
      agentId: fullAgentDef.id,
      role: fullAgentDef.shortRole,
      text: '',
      timestamp: Date.now(),
      meta: null,
      isError: false
    };

    session.messages.push(agentMsg);
    session.updatedAt = Date.now();
    await put('sessions', session);

    if (onSpeakerStart) {
      onSpeakerStart(agentMsg);
    }

    // Build system prompt with context chaining
    let systemPrompt = '';
    if (typeof fullAgentDef.systemPromptTemplate === 'function') {
      systemPrompt = fullAgentDef.systemPromptTemplate({
        venture,
        phase: phase.id,
        transcript: session.messages.slice(0, -1),
        priorAgentReplies: priorAgentReplies,
        deliverableType: phase.deliverableType
      });
    } else {
      systemPrompt = `You are ${fullAgentDef.name}, ${fullAgentDef.role}.`;
    }

    const messages = [
      { role: 'user', content: text }
    ];

    let speakerFailed = false;

    try {
      const streamGen = stream({
        system: systemPrompt,
        messages,
        signal,
        meta: {
          agentId: fullAgentDef.id,
          action: 'deliberate',
          venture,
          phase: phase.label,
          founderText: text,
          priorSpeakers: priorAgentReplies.map(p => p.agentName)
        }
      });

      for await (const chunk of streamGen) {
        if (signal?.aborted || sessionControl?.isStopped) break;
        agentMsg.text += chunk;
        if (onChunk) {
          onChunk(agentMsg.id, agentMsg.text);
        }
      }
    } catch (err) {
      speakerFailed = true;
      if (err.name === 'AbortError' || signal?.aborted || sessionControl?.isStopped) {
        if (!agentMsg.text) {
          agentMsg.text = '*[Deliberation paused or stopped by founder]*';
        } else {
          agentMsg.text += ' *[Stopped]*';
        }
        if (onChunk) onChunk(agentMsg.id, agentMsg.text);
      } else {
        console.error(`Orchestrator error for director ${fullAgentDef.name}:`, err);
        agentMsg.isError = true;
        agentMsg.errorMessage = err.message || 'Director failed to respond';
        agentMsg.retryPayload = {
          ventureId: venture.id,
          phaseId: phase.id,
          roundId,
          founderText: text,
          agentId: fullAgentDef.id
        };
        if (!agentMsg.text) {
          agentMsg.text = `*[Director Consultation Error: ${err.message || 'Connection failure'}]*`;
        }
        if (onChunk) onChunk(agentMsg.id, agentMsg.text);
        if (onSpeakerError) onSpeakerError(agentMsg, err);
      }
    }

    const provider = await getProvider();
    agentMsg.meta = {
      provider: provider.name,
      model: provider.model || (provider.name === 'mock' ? 'deterministic-sim' : 'default'),
      timestamp: Date.now()
    };

    await put('sessions', session);

    if (onSpeakerDone) {
      onSpeakerDone(agentMsg);
    }
    if (onAgentSpeakingChange) {
      onAgentSpeakingChange(fullAgentDef.id, false);
    }

    if (!speakerFailed && agentMsg.text) {
      priorAgentReplies.push({
        agentName: fullAgentDef.name,
        shortRole: fullAgentDef.shortRole,
        content: agentMsg.text
      });
    }

    // Pacing delay between speakers (~400ms)
    if (i < activeParticipants.length - 1 && !(signal?.aborted || sessionControl?.isStopped)) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Clear all speaking pulse states
  if (onAgentSpeakingChange) {
    activeParticipants.forEach(a => onAgentSpeakingChange(a.id, false));
  }

  // 4. The Chair "Round Summary"
  // Run if not stopped cold without any speaker, or if founder skipped to chair
  const shouldRunChair = !(signal?.aborted || sessionControl?.isStopped) || sessionControl?.skipToChair;
  const hasSubstance = priorAgentReplies.length > 0 || sessionControl?.skipToChair;

  if (shouldRunChair && hasSubstance) {
    if (onProgress) {
      onProgress({
        roundId,
        current: activeParticipants.length,
        total: activeParticipants.length,
        agentName: 'The Chair',
        agentId: 'chair',
        isChairSummary: true
      });
    }

    if (onAgentSpeakingChange) {
      onAgentSpeakingChange('chair', true);
    }

    const chairMsg = {
      id: `m_${Date.now()}_chair`,
      roundId,
      author: 'The Chair',
      agentId: 'chair',
      role: 'Board Chair',
      text: '',
      isRoundSummary: true,
      timestamp: Date.now(),
      meta: null,
      isError: false
    };

    session.messages.push(chairMsg);
    session.updatedAt = Date.now();
    await put('sessions', session);

    if (onSpeakerStart) {
      onSpeakerStart(chairMsg);
    }

    const chairPrompt = buildChairRoundSummaryPrompt({
      venture,
      phase: phase.id,
      founderPrompt: text,
      transcript: session.messages.slice(0, -1),
      priorAgentReplies
    });

    try {
      const streamGen = stream({
        system: chairPrompt,
        messages: [{ role: 'user', content: `Please deliver the executive Round Summary for this deliberation.` }],
        signal,
        meta: {
          agentId: 'chair',
          action: 'round_summary',
          venture,
          phase: phase.label,
          founderText: text
        }
      });

      for await (const chunk of streamGen) {
        if (signal?.aborted || sessionControl?.isStopped) break;
        chairMsg.text += chunk;
        if (onChunk) {
          onChunk(chairMsg.id, chairMsg.text);
        }
      }
    } catch (err) {
      console.error('The Chair Round Summary error:', err);
      chairMsg.isError = true;
      chairMsg.errorMessage = err.message;
      if (!chairMsg.text) {
        chairMsg.text = `*[Chair Round Summary Error: ${err.message}]*`;
      }
      if (onChunk) onChunk(chairMsg.id, chairMsg.text);
      if (onSpeakerError) onSpeakerError(chairMsg, err);
    }

    const provider = await getProvider();
    chairMsg.meta = {
      provider: provider.name,
      model: provider.model || (provider.name === 'mock' ? 'deterministic-sim' : 'default'),
      timestamp: Date.now()
    };

    await put('sessions', session);

    if (onSpeakerDone) {
      onSpeakerDone(chairMsg);
    }
    if (onAgentSpeakingChange) {
      onAgentSpeakingChange('chair', false);
    }
  }

  // 5. Finalize Round Record
  roundRecord.completedAt = Date.now();
  session.updatedAt = Date.now();
  await put('sessions', session);

  return session;
}

/**
 * Challenge a claim with David (Validation Partner)
 * Interrogates an assertion as a falsifiable hypothesis with kill criterion.
 * Attaches the challenge thread directly to the target message.
 */
export async function challengeClaimWithDavid({
  venture,
  phase,
  messageId,
  agentName,
  claimText,
  session,
  onStart,
  onChunk,
  onDone,
  signal
}) {
  const targetMsg = (session.messages || []).find(m => m.id === messageId);
  if (!targetMsg) {
    throw new Error(`Target message ${messageId} not found in session.`);
  }

  const david = getAgent('david') || DEFAULT_AGENTS[1];

  const challengeObj = {
    id: `ch_${Date.now()}`,
    author: david.name,
    agentId: 'david',
    role: david.shortRole,
    targetMessageId: messageId,
    targetAgentName: agentName,
    claimText: claimText,
    text: '',
    timestamp: Date.now(),
    meta: null
  };

  targetMsg.challenge = challengeObj;
  session.updatedAt = Date.now();
  await put('sessions', session);

  if (onStart) onStart(challengeObj);

  const challengePrompt = buildDavidChallengePrompt({
    venture,
    phase: phase.id,
    agentName,
    claimText,
    transcript: session.messages || []
  });

  const messages = [
    { role: 'user', content: `Interrogate this claim by ${agentName}: "${claimText}"` }
  ];

  try {
    const streamGen = stream({
      system: challengePrompt,
      messages,
      signal,
      meta: {
        agentId: 'david',
        action: 'challenge',
        venture,
        phase: phase.label,
        targetSpeaker: agentName,
        claimText
      }
    });

    for await (const chunk of streamGen) {
      if (signal?.aborted) break;
      challengeObj.text += chunk;
      if (onChunk) onChunk(challengeObj.id, challengeObj.text);
    }
  } catch (err) {
    if (signal?.aborted || err.name === 'AbortError') {
      if (!challengeObj.text) challengeObj.text = '*[Interrogation stopped]*';
      if (onChunk) onChunk(challengeObj.id, challengeObj.text);
    } else {
      challengeObj.text += `\n\n*[Interrogation error: ${err.message}]*`;
      if (onChunk) onChunk(challengeObj.id, challengeObj.text);
      throw err;
    }
  }

  const provider = await getProvider();
  challengeObj.meta = {
    provider: provider.name,
    model: provider.model || (provider.name === 'mock' ? 'deterministic-sim' : 'default'),
    timestamp: Date.now()
  };

  await put('sessions', session);

  if (onDone) onDone(challengeObj);

  return challengeObj;
}

/**
 * Retry an individual speaker whose message errored in a round
 */
export async function retrySpeakerInRound({
  venture,
  phase,
  messageId,
  session,
  onStart,
  onChunk,
  onDone,
  signal
}) {
  const targetMsg = (session.messages || []).find(m => m.id === messageId);
  if (!targetMsg) {
    throw new Error(`Target message ${messageId} not found.`);
  }

  const agent = getAgent(targetMsg.agentId) || THE_CHAIR;
  targetMsg.isError = false;
  targetMsg.errorMessage = null;
  targetMsg.text = '';
  session.updatedAt = Date.now();
  await put('sessions', session);

  if (onStart) onStart(targetMsg);

  let systemPrompt = '';
  if (targetMsg.isRoundSummary || targetMsg.agentId === 'chair') {
    systemPrompt = buildChairRoundSummaryPrompt({
      venture,
      phase: phase.id,
      founderPrompt: `Retry deliberation summary`,
      transcript: session.messages.filter(m => m.id !== messageId),
      priorAgentReplies: []
    });
  } else if (typeof agent.systemPromptTemplate === 'function') {
    systemPrompt = agent.systemPromptTemplate({
      venture,
      phase: phase.id,
      transcript: session.messages.filter(m => m.id !== messageId),
      priorAgentReplies: [],
      deliverableType: phase.deliverableType
    });
  } else {
    systemPrompt = `You are ${agent.name}, ${agent.role}. Advise the founder.`;
  }

  try {
    const streamGen = stream({
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Please provide your analytical board assessment.' }],
      signal,
      meta: {
        agentId: agent.id,
        action: 'deliberate',
        venture,
        phase: phase.label
      }
    });

    for await (const chunk of streamGen) {
      if (signal?.aborted) break;
      targetMsg.text += chunk;
      if (onChunk) onChunk(targetMsg.id, targetMsg.text);
    }
  } catch (err) {
    targetMsg.isError = true;
    targetMsg.errorMessage = err.message;
    targetMsg.text = `*[Retry failed: ${err.message}]*`;
    if (onChunk) onChunk(targetMsg.id, targetMsg.text);
    throw err;
  }

  const provider = await getProvider();
  targetMsg.meta = {
    provider: provider.name,
    model: provider.model || (provider.name === 'mock' ? 'deterministic-sim' : 'default'),
    timestamp: Date.now()
  };

  await put('sessions', session);

  if (onDone) onDone(targetMsg);

  return targetMsg;
}

/**
 * Synthesize the official phase deliverable memo with The Chair
 */
export async function synthesizePhaseDeliverable({
  venture,
  phase,
  session,
  onChunk,
  signal
}) {
  const targetDeliverable = phase.deliverableType || 'Milestone Deliverable Memo';

  const systemPrompt = THE_CHAIR.systemPromptTemplate({
    venture,
    phase: phase.id,
    transcript: session.messages || [],
    deliverableType: targetDeliverable
  });

  const messages = [
    {
      role: 'user',
      content: `Please synthesize the official ${targetDeliverable} for ${venture.name} across our Phase 0${phase.number}: ${phase.label} deliberations.`
    }
  ];

  let fullContent = '';

  try {
    const streamGen = stream({
      system: systemPrompt,
      messages,
      signal,
      meta: {
        agentId: 'chair',
        action: 'synthesize',
        venture,
        phase: phase.label,
        deliverableType: targetDeliverable
      }
    });

    for await (const chunk of streamGen) {
      if (signal && signal.aborted) {
        break;
      }
      fullContent += chunk;
      if (onChunk) {
        onChunk(fullContent);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      // The founder stopped synthesis. Do NOT ratify the milestone or persist a
      // partial deliverable — leave the venture state exactly as it was.
      throw new DOMException('Synthesis stopped by user', 'AbortError');
    }
    // Provider/network failure: surface it and leave venture state untouched so a
    // failed synthesis can never mark the phase complete or pollute board memory.
    console.error('Synthesis error:', err);
    throw err;
  }

  if (!fullContent.trim()) {
    throw new Error('Synthesis produced no content; the milestone was not ratified.');
  }

  // Upsert: re-synthesizing the same phase must replace the existing memo rather
  // than accumulate duplicate deliverable records.
  const existingDeliverables = await getAll('deliverables');
  const existing = existingDeliverables.find(d => d.ventureId === venture.id && d.phase === phase.id);

  const deliverable = {
    id: existing?.id || `deliv_${venture.id}_${phase.id}_${Date.now()}`,
    ventureId: venture.id,
    phase: phase.id,
    title: `${targetDeliverable} — ${venture.name}`,
    content: fullContent,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  await put('deliverables', deliverable);

  venture.completedPhases = venture.completedPhases || [];
  if (!venture.completedPhases.includes(phase.id)) {
    venture.completedPhases.push(phase.id);
  }

  const memoryMarker = `[Phase 0${phase.number}: ${phase.label} Milestone Concluded]`;
  const memoryStamp = `${memoryMarker}\nDeliverable: ${targetDeliverable}.\nBoard consensus reached on core stage-gate criteria. Actionable directives logged for founder execution.`;
  if (venture.boardMemory && venture.boardMemory.trim()) {
    // Guard against stamping the same phase milestone into board memory twice.
    if (!venture.boardMemory.includes(memoryMarker)) {
      venture.boardMemory = `${venture.boardMemory.trim()}\n\n${memoryStamp}`;
    }
  } else {
    venture.boardMemory = memoryStamp;
  }

  await saveVenture(venture);

  const announcementMsg = {
    id: `m_${Date.now()}_chair_signoff`,
    author: 'The Chair',
    agentId: 'chair',
    role: 'The Chair',
    text: `### Milestone Ratified: ${targetDeliverable}

The board has formally concluded deliberations on **Phase 0${phase.number}: ${phase.label}**. 

The official executive deliverable has been synthesized and entered into the permanent venture repository. The founder may inspect and export the document under the **Deliverables** tab or proceed directly to the next stage-gate review.`,
    timestamp: Date.now()
  };

  session.messages = session.messages || [];
  session.messages.push(announcementMsg);
  session.updatedAt = Date.now();
  await put('sessions', session);

  return { deliverable, venture };
}
