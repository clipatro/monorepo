import type { Node, Edge } from "@xyflow/react";
import type { PipelineNode } from "@/lib/api";

/**
 * Compute node positions from the pipeline graph using topological layering.
 * Nodes at the same dependency depth are stacked vertically.
 */
export function computeLayout(graph: PipelineNode[]): { nodes: Node[]; edges: Edge[] } {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	// Group by dependency depth (topological layers)
	const depthMap = new Map<string, number>();
	const computeDepth = (type: string, visited: Set<string> = new Set()): number => {
		if (depthMap.has(type)) return depthMap.get(type)!;
		if (visited.has(type)) return 0;
		visited.add(type);
		const node = graph.find((n) => n.type === type);
		if (!node || node.dependsOn.length === 0) {
			depthMap.set(type, 0);
			return 0;
		}
		const maxDep = Math.max(...node.dependsOn.map((d) => computeDepth(d, visited)));
		depthMap.set(type, maxDep + 1);
		return maxDep + 1;
	};

	graph.forEach((n) => computeDepth(n.type));

	// Group nodes by depth
	const layers = new Map<number, string[]>();
	for (const [type, depth] of depthMap) {
		if (!layers.has(depth)) layers.set(depth, []);
		layers.get(depth)!.push(type);
	}

	const NODE_W = 220;
	const NODE_H = 90;
	const GAP_X = 80;
	const GAP_Y = 40;

	for (const [depth, types] of layers) {
		const x = depth * (NODE_W + GAP_X);
		types.forEach((type, i) => {
			const totalH = types.length * NODE_H + (types.length - 1) * GAP_Y;
			const startY = -totalH / 2;
			const y = startY + i * (NODE_H + GAP_Y);
			nodes.push({
				id: type,
				type: "step",
				position: { x, y },
				data: { label: type, status: "pending" } as unknown as Record<string, unknown>,
			});
		});
	}

	// Create edges from dependencies
	for (const node of graph) {
		for (const dep of node.dependsOn) {
			edges.push({
				id: `${dep}->${node.type}`,
				source: dep,
				target: node.type,
				animated: false,
				className: "stroke-muted",
			});
		}
	}

	return { nodes, edges };
}
