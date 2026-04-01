import { useStore } from "../store/useStore";
import type { ModelRef } from "@shared/protocol";

export function ModelAgentBar() {
  const providers = useStore((s) => s.providers);
  const agents = useStore((s) => s.agents);
  const selectedModel = useStore((s) => s.selectedModel);
  const selectedAgent = useStore((s) => s.selectedAgent);
  const setSelectedModel = useStore((s) => s.setSelectedModel);
  const setSelectedAgent = useStore((s) => s.setSelectedAgent);

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSelectedModel(val ? (JSON.parse(val) as ModelRef) : undefined);
  }

  function handleAgentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedAgent(e.target.value || undefined);
  }

  const modelValue = selectedModel ? JSON.stringify(selectedModel) : "";

  return (
    <div id="selectors">
      <select
        id="model-select"
        aria-label="Model"
        value={modelValue}
        onChange={handleModelChange}
      >
        <option value="">Default model</option>
        {providers.map((prov) =>
          Object.entries(prov.models ?? {}).map(([modelId, model]) => (
            <option
              key={`${prov.id}:${modelId}`}
              value={JSON.stringify({ providerID: prov.id, modelID: modelId })}
            >
              {(model as { name?: string }).name ?? modelId}
            </option>
          )),
        )}
      </select>
      <select
        id="agent-select"
        aria-label="Agent"
        value={selectedAgent ?? ""}
        onChange={handleAgentChange}
      >
        <option value="">Default agent</option>
        {Object.entries(agents).map(([agentId, agent]) => (
          <option key={agentId} value={agentId}>
            {agent.name ?? agentId}
          </option>
        ))}
      </select>
    </div>
  );
}
