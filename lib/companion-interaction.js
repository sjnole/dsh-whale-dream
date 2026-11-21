const maximumDetail = 8000;
const maximumQuestions = 8;
const maximumOptions = 12;

function completeText(value, max) {
  if (typeof value !== 'string' || value.length > max) return '';
  return value.toWellFormed().replace(/\r\n?/g, '\n');
}

export function readCompanionInteraction(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  const key = completeText(payload.key, 512);
  const kind = payload.kind;
  const title = completeText(payload.title, 500);
  const detail = completeText(payload.detail, maximumDetail);
  if (!key || !title || (payload.detail && !detail) || !['approval', 'plan', 'question'].includes(kind)) return undefined;
  const skip = payload.skip;
  const canSkip = (kind === 'approval' && skip === 'approvalQuestion') || (kind === 'plan' && ['planChoice', 'revise'].includes(skip));
  if (skip !== undefined && !canSkip) return undefined;
  const callId = completeText(payload.callId, 512);
  const toolName = completeText(payload.toolName, 240);
  if ((payload.callId && !callId) || (payload.toolName && !toolName)) return undefined;
  if (callId && (kind !== 'approval' || !toolName)) return undefined;
  if (skip === 'approvalQuestion' && (callId || toolName)) return undefined;
  const items = payload.questions;
  if (!Array.isArray(items) || items.length > maximumQuestions || (kind !== 'approval' && !items.length)) return undefined;
  if (skip && items.length !== 1) return undefined;
  const questions = [];
  const ids = new Set();
  for (const item of items) {
    const id = completeText(item?.id, 240);
    const prompt = completeText(item?.title, 400);
    const more = completeText(item?.detail, maximumDetail);
    if (!id || !prompt || ids.has(id) || (item.detail && !more) || !Array.isArray(item.options) || item.options.length > maximumOptions) return undefined;
    ids.add(id);
    const options = item.options.map(option => ({ label: completeText(option?.label, 240), detail: completeText(option?.detail, maximumDetail) }));
    if (options.some((option, index) => !option.label || (item.options[index].detail && !option.detail))) return undefined;
    questions.push({ id, title: prompt, detail: more, multiple: item.multiple === true, custom: item.custom === true, options });
  }
  const card = { key, kind, title, detail, questions, ...(skip ? { skip } : {}) };
  if (JSON.stringify(card).length > 18000) return undefined;
  return { card, callId, toolName };
}

export function withCompanionToolContext(card, session, callId, toolName) {
  if (!callId) return card;
  const floor = Math.max(session.inheritedEventCount ?? 0, session.seq - 5000);
  for (let seq = session.seq - 1; seq >= floor; seq--) {
    const record = session.eventAt(seq);
    if (record?.type === 'tool/result' && record.data?.callId === callId) return undefined;
    if (record?.type !== 'tool/call' || record.data?.callId !== callId || record.data?.name !== toolName) continue;
    const args = completeText(record.data.arguments, maximumDetail);
    if (!args) return undefined;
    const detail = [card.detail, `工具：${toolName}`, args].filter(Boolean).join('\n\n');
    return detail.length <= maximumDetail ? { ...card, detail } : undefined;
  }
  return undefined;
}
