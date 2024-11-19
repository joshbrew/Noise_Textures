//based on https://github.com/Kreswell/Small-Projects/blob/master/FlowSim.ipynb

import Delaunator from "./Delaunator";
import { BaseNoise, PerlinNoise, RidgedMultifractalNoise4, RidgeNoise, VoronoiTileNoise, FractalBrownianMotion, RippleNoise, FractalRipples, FVoronoiRipple3D, VoronoiBrownianMotion3, FractalBrownianMotion3, FVoronoiCircularRipple3D } from "../noiseFunctions";

self.onmessage = function (event) {
    const data = event.data;
    if (data.type === 'start') {
        computeRiverNetwork(data.npts);
    }
};

function computeRiverNetwork(npts) {
    const seed1 = 1122828271;
    const seed2 = 1075380921 + Date.now();

    const rand1 = new BaseNoise(seed1);
    const rand2 = new VoronoiTileNoise(seed2);

    const pts = generatePoints(rand1, npts);
    self.postMessage({ type: 'progress', message: 'Points generated.' });

    const zs = computeHeights(rand2, pts);
    self.postMessage({ type: 'progress', message: 'Heights computed.' });

    const delaunay = Delaunator.from(pts);
    const neighbors = computeNeighbors(delaunay, pts, 0.03);
    self.postMessage({ type: 'progress', message: 'Neighbors computed.' });

    const riverEdges = constructRiverNetwork(pts, zs, neighbors);
    self.postMessage({ type: 'result', edges: riverEdges, pts });
}

function generatePoints(rand, count) {
    const points = new Array(count);
    for (let i = 0; i < count; i++) {
        points[i] = [rand.seededRandom(), rand.seededRandom()];
    }
    return points;
}

function computeHeights(noise, points) {
    const zoom = 0.7;
    const freq = 1;
    const octaves = 1;
    const lacunarity = 2.0;
    const gain = 0.5;

    const heights = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        heights[i] = noise.generateNoise(x, y, 0, zoom, freq, octaves, lacunarity, gain);
    }
    return heights;
}

function computeNeighbors(delaunay, points, maxEdgeLength) {
    const neighbors = Array.from({ length: points.length }, () => []);
    const triangles = delaunay.triangles;
    const nextHalfedge = (e) => (e % 3 === 2 ? e - 2 : e + 1);

    for (let e = 0; e < triangles.length; e++) {
        const p = triangles[e];
        const q = triangles[nextHalfedge(e)];

        if (distance(points[p], points[q]) <= maxEdgeLength) {
            if (!neighbors[p].includes(q)) neighbors[p].push(q);
            if (!neighbors[q].includes(p)) neighbors[q].push(p);
        }
    }
    return neighbors;
}

function distance([x1, y1], [x2, y2]) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

function constructRiverNetwork(pts, zs, neighbors) {
    const npts = pts.length;
    const gr = initializeGraph(npts);
    const indices = Array.from(zs.keys()).sort((a, b) => zs[b] - zs[a]);
    let flowq = indices.slice();
    let rechecks = [];
    const visited = new Set();
    const vetos = new Set();

    const clearOutflows = createClearOutflows(gr, zs, rechecks);
    const processNode = createProcessNode(pts, zs, neighbors, gr, vetos, rechecks, visited);

    while (flowq.length > 0 || rechecks.length > 0) {
        const thisnode = getNextNode(flowq, rechecks, zs);
        visited.add(thisnode);

        clearOutflows(thisnode);

        if (isBoundary(pts[thisnode])) continue;

        processNode(thisnode);
    }

    return collectEdges(gr);
}

function initializeGraph(npts) {
    const graph = Array.from({ length: npts }, () => ({
        predecessors: new Set(),
        successors: new Set(),
        inEdges: new Map(),
        outEdges: new Map(),
    }));
    return graph;
}

function createClearOutflows(gr, zs, rechecks) {
    return function clearOutflows(node) {
        const nodeData = gr[node];
        const successors = Array.from(nodeData.successors);

        for (let i = 0; i < successors.length; i++) {
            const oldout = successors[i];
            nodeData.successors.delete(oldout);
            gr[oldout].predecessors.delete(node);
            gr[oldout].inEdges.delete(node);
            nodeData.outEdges.delete(oldout);

            if (zs[oldout] > zs[node]) rechecks.push(oldout);
        }
    };
}

function createProcessNode(pts, zs, neighbors, gr, vetos, rechecks, visited) {
    const flowrate = createFlowRate(pts, zs);

    return function processNode(node) {
        const { nextnode, outflow, m } = findOutflow(node, pts, zs, neighbors, gr, vetos, flowrate);

        if (nextnode !== null) {
            updateGraph(node, nextnode, gr, outflow, m, zs, rechecks);
        }
    };
}

function createFlowRate(pts, zs) {
    return function flowrate(p1, p2, vel) {
        const [dx, dy] = [pts[p2][0] - pts[p1][0], pts[p2][1] - pts[p1][1]];
        const dz = zs[p2] - zs[p1];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const vi = (dx * vel[0] + dy * vel[1] + dz * vel[2]) / r;
        const vfsq = vi * vi - 2 * dz;

        if (vfsq < 0) return { dt: -Infinity, vf: [0, 0, 0] };

        const dt = (vi + Math.sqrt(vfsq)) / (2 * r);
        return { dt, vf: [(dx / r) * Math.sqrt(vfsq), (dy / r) * Math.sqrt(vfsq), dz / r] };
    };
}

function findOutflow(node, pts, zs, neighbors, gr, vetos, flowrate) {
    const nodeData = gr[node];
    let px = 0,
        py = 0,
        pz = 0,
        m = 1;

    const predecessors = Array.from(nodeData.predecessors);
    for (let i = 0; i < predecessors.length; i++) {
        const pred = predecessors[i];
        const edge = gr[pred].outEdges.get(node);
        if (edge) {
            const { outflow, weight } = edge;
            px += outflow[0];
            py += outflow[1];
            pz += outflow[2];
            m += weight;
        }
    }

    const vi = [px / m, py / m, pz / m];
    let bestNeighbor = null,
        maxDt = -Infinity,
        bestOutflow = null;

    const nodeNeighbors = neighbors[node];
    for (let i = 0; i < nodeNeighbors.length; i++) {
        const nbr = nodeNeighbors[i];
        if (vetos.has(nbr) || zs[nbr] > zs[node] || isBoundary(pts[nbr])) continue;

        const { dt, vf } = flowrate(node, nbr, vi);
        if (dt > maxDt) {
            maxDt = dt;
            bestOutflow = vf.map((v) => v * m);
            bestNeighbor = nbr;
        }
    }

    return { nextnode: bestNeighbor, outflow: bestOutflow, m };
}

function updateGraph(from, to, gr, outflow, weight, zs, rechecks) {
    const fromData = gr[from];
    const toData = gr[to];

    fromData.successors.add(to);
    fromData.outEdges.set(to, { outflow, weight });
    toData.predecessors.add(from);
    toData.inEdges.set(from, { outflow, weight });

    if (zs[to] > zs[rechecks[0]]) rechecks.push(to);
}

function collectEdges(graph) {
    const edges = [];
    for (let i = 0; i < graph.length; i++) {
        const node = graph[i];
        const successors = Array.from(node.successors);

        for (let j = 0; j < successors.length; j++) {
            const target = successors[j];
            const { weight } = node.outEdges.get(target);
            edges.push({ source: i, target, weight });
        }
    }
    return edges;
}

function isBoundary([x, y]) {
    return x <= 0 || x >= 1 || y <= 0 || y >= 1;
}

function getNextNode(flowq, rechecks, zs) {
    if (rechecks.length > 0) {
        rechecks.sort((a, b) => zs[b] - zs[a]);
        return rechecks.pop();
    }
    return flowq.shift();
}

export default self;
