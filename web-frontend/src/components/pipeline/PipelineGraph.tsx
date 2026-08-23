import { useMemo, useRef, useState, useEffect } from "react";
import {
	ReactFlow,
	ReactFlowProvider,
	Background,
	Controls,
	MiniMap,
	type Node,
	type Edge,
	BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PipelineNode, RunDetails } from "@/lib/api";
import { computeLayout } from "./computeLayout";
import { stepNodeTypes, type StepNodeData } from "./StepNode";

interface PipelineGraphProps {
	pipeline: PipelineNode[];
	run: RunDetails | null;
	onStepClick?: (stepId: string) => void;
}

/**
 * PipelineGraph — self-contained React Flow graph.
 *
 * The `key` is on `ReactFlowProvider` (not just ReactFlow) so the ENTIRE
 * subtree remounts when switching runs: fresh store, fresh ReactFlow
 * instance, fresh `fitView` call. Previous attempts keyed only the
 * ReactFlow component, but the provider's internal store persisted
 * across remounts and caused the graph to render then vanish.
 *
 * Within a run, polling/SSE updates change node data (status, cost) but
 * NOT the key, so the component stays mounted and the viewport is preserved.
 */
export function PipelineGraph({ pipeline, run, onStepClick }: PipelineGraphProps) {
	const runId = run?.id ?? "no-run";
	const [isMobile, setIsMobile] = useState(
		typeof window !== "undefined" ? window.innerWidth < 768 : false,
	);
	useEffect(() => {
		const onResize = () => setIsMobile(window.innerWidth < 768);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// Stabilize onStepClick via ref so useMemo doesn't recompute on every
	// parent re-render (polling causes parent re-renders every 3s).
	const onStepClickRef = useRef(onStepClick);
	onStepClickRef.current = onStepClick;

	const { nodes, edges } = useMemo(() => {
		// When a run is selected, build the pipeline graph from the run's steps.
		// Each step carries its own dependsOn, isPaid, requiresApproval, and label
		// from the template-driven pipeline. When no run is selected, fall back
		// to the global pipeline reference graph.
		let graph: PipelineNode[];
		if (run && run.steps.length > 0) {
			graph = run.steps.map((s) => ({
				type: s.stepType,
				label: s.label,
				requiresApproval: s.requiresApproval,
				isPaid: s.isPaid,
				service: null,
				dependsOn: s.dependsOn,
			}));
		} else {
			graph = pipeline;
		}

		const { nodes: layoutNodes, edges: layoutEdges } = computeLayout(graph);

		if (!run) {
			return {
				nodes: layoutNodes.map((n) => ({
					...n,
					data: {
						...n.data,
						label: graph.find((p) => p.type === n.id)?.label ?? n.id,
						status: "pending",
						isPaid: graph.find((p) => p.type === n.id)?.isPaid ?? false,
						requiresApproval: graph.find((p) => p.type === n.id)?.requiresApproval ?? false,
						provider: null,
						model: null,
						costUsd: null,
						attemptCount: 0,
						onClick: undefined,
					} as unknown as Record<string, unknown>,
				})),
				edges: layoutEdges,
			};
		}

		const stepMap = new Map(run.steps.map((s) => [s.stepType, s]));

		return {
			nodes: layoutNodes.map((n) => {
				const step = stepMap.get(n.id);
				const pipelineNode = graph.find((p) => p.type === n.id);
				return {
					...n,
					data: {
						label: pipelineNode?.label ?? n.id,
						status: step?.status ?? "pending",
						isPaid: pipelineNode?.isPaid ?? false,
						requiresApproval: pipelineNode?.requiresApproval ?? false,
						provider: step?.provider ?? null,
						model: step?.model ?? null,
						costUsd: step?.actualCostUsd ?? null,
						attemptCount: step?.attempts.length ?? 0,
						onClick: () => {
							if (step) onStepClickRef.current?.(step.id);
						},
					} as unknown as Record<string, unknown>,
				};
			}),
			edges: layoutEdges.map((e) => {
				const targetStep = stepMap.get(e.target);
				const sourceStep = stepMap.get(e.source);
				const isActive = sourceStep?.status === "completed" && targetStep?.status === "running";
				return {
					...e,
					animated: isActive,
					className: isActive ? "stroke-blue-500" : "stroke-muted",
				};
			}),
		};
	}, [pipeline, run]);

	return (
		<ReactFlowProvider key={runId}>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={stepNodeTypes}
				fitView
				fitViewOptions={{ padding: isMobile ? 0.05 : 0.2 }}
				proOptions={{ hideAttribution: true }}
			>
				<Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(0 0% 20%)" />
				<Controls showInteractive={false} showZoom={!isMobile} showFitView={!isMobile} />
				{!isMobile && (
					<MiniMap
						pannable
						zoomable
						nodeColor={(node) => {
							const status = (node.data as unknown as StepNodeData)?.status;
							switch (status) {
								case "completed": return "#22c55e";
								case "running": return "#3b82f6";
								case "failed": return "#ef4444";
								case "waiting_approval": return "#f59e0b";
								case "skipped": return "#6b7280";
								default: return "#3f3f46";
							}
						}}
						nodeStrokeColor="hsl(0 0% 14.9%)"
						maskColor="rgba(0, 0, 0, 0.5)"
					/>
				)}
			</ReactFlow>
		</ReactFlowProvider>
	);
}
