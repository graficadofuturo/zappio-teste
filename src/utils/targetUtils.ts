export function normalizeTarget(target: any) {
  if (!target) return null;

  if (typeof target === "string") {
    return {
      id: target,
      jid: target,
      name: target
    };
  }

  // Handle formats like { instance_id: '...', group_id: '...' }
  // or the standard { id: '...', name: '...' }
  const id = target.id || target.jid || target.value || target.remoteJid || target.group_id;

  if (!id) return null;

  // If it's a combined ID like "instanceId_jid", extract the jid part for normalization if needed
  // But many places expect the full group_id. We'll keep the ID as is but provide a clean name.
  
  return {
    ...target,
    id: String(id),
    jid: String(id),
    name: String(target.name || target.label || target.subject || id)
  };
}
