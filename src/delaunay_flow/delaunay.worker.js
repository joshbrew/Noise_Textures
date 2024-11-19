import Delaunator from "./Delaunator";
import { BaseNoise, PerlinNoise } from "../noiseFunctions";

self.onmessage = function (event) {
    const data = event.data;
    if (data.type === 'start') {
        const npts = data.npts;

        // Begin computation
        computeRiverNetwork(npts);
    }
};

function computeRiverNetwork(npts) {
    const seed1 = 1122828271;
    const seed2 = 1075380921 + Date.now();

    const rand1 = new BaseNoise(seed1); // Random generator for points
    const rand2 = new PerlinNoise(seed2); // Perlin noise generator for heightmap

    // Generate random points using BaseNoise
    const pts = [];
    for (let i = 0; i < npts; i++) {
        pts.push([rand1.seededRandom(), rand1.seededRandom()]);
    }

    self.postMessage({ type: 'progress', message: 'Points generated.' });

    // Generate heights using PerlinNoise generateNoise method
    const zs = [];
    const zoom = 10.0; // Zoom level for Perlin noise
    const freq = 1; // Frequency
    const octaves = 6; // Number of octaves
    const lacunarity = 2.0; // Frequency multiplier
    const gain = 0.5; // Amplitude multiplier
    const xShift = 0; // Optional x-axis shift
    const yShift = 0; // Optional y-axis shift

    for (let i = 0; i < npts; i++) {
        const [x, y] = pts[i];
        zs.push(rand2.generateNoise(x, y, 0, zoom, freq, octaves, lacunarity, gain, xShift, yShift));
    }

    self.postMessage({ type: 'progress', message: 'Heights computed.' });

    const delaunay = Delaunator.from(pts);

    function computeNeighbors(delaunay, npts, maxEdgeLength, points) {
        const neighbors = Array.from({ length: npts }, () => []);

        function nextHalfedge(e) {
            return (e % 3 === 2) ? e - 2 : e + 1;
        }

        function distance(p1, p2) {
            const dx = points[p1][0] - points[p2][0];
            const dy = points[p1][1] - points[p2][1];
            return Math.sqrt(dx * dx + dy * dy);
        }

        for (let e = 0; e < delaunay.triangles.length; e++) {
            const p = delaunay.triangles[e];
            const q = delaunay.triangles[nextHalfedge(e)];

            // Only add neighbors if the edge length is below the maximum
            if (distance(p, q) <= maxEdgeLength) {
                if (!neighbors[p].includes(q)) neighbors[p].push(q);
                if (!neighbors[q].includes(p)) neighbors[q].push(p);
            }
        }

        return neighbors;
    }

    // Update this line to pass the maxEdgeLength and points to computeNeighbors
    const maxEdgeLength = 0.03; // Adjust this value as needed
    const neighbors = computeNeighbors(delaunay, npts, maxEdgeLength, pts);

    self.postMessage({ type: 'progress', message: 'Neighbors computed.' });


    const hull = delaunay.hull;
    const hullSet = new Set(hull);

    const gr = new Map();
    for (let i = 0; i < npts; i++) {
        gr.set(i, {
            predecessors: new Set(),
            successors: new Set(),
            inEdges: new Map(),
            outEdges: new Map(),
        });
    }

    const indices = zs.map((z, i) => [z, i]).sort((a, b) => b[0] - a[0]).map(([z, i]) => i);
    let flowq = indices.slice();

    let rechecks = [];
    let visited = new Set();
    let vetos = new Set();

    function isBoundary(point) {
        const [x, y] = point;
        return x <= 0 || x >= 1 || y <= 0 || y >= 1;
    }

    function flowrate(p1, p2, vel = [0, 0, 0]) {
        const x = pts[p2][0] - pts[p1][0];
        const y = pts[p2][1] - pts[p1][1];
        const z = zs[p2] - zs[p1];
        const r = Math.sqrt(x * x + y * y + z * z);

        const vi = (x * vel[0] + y * vel[1] + z * vel[2]) / r;
        const vfsq = vi * vi - 2 * z;

        let vf = [0, 0, 0];
        let dt = -Infinity;

        if (vfsq >= 0) {
            dt = (vi + Math.sqrt(vfsq)) / (2 * r);
            const vhat = Math.sqrt(vfsq) / r;
            vf = [vhat * x, vhat * y, vhat * z];
        }

        return { dt, vf };
    }

    function findOutflow(pt, veto = new Set(), vetouphill = false) {
        let px = 0, py = 0, pz = 0;
        let m = 1;

        const node = gr.get(pt);
        node.predecessors.forEach(pred => {
            const edge = gr.get(pred).outEdges.get(pt);
            const outflow = edge.outflow;
            const mass = edge.weight;
            px += outflow[0];
            py += outflow[1];
            pz += outflow[2];
            m += mass;

            if (node.successors.has(pred) && gr.get(pred).outEdges.get(pt).weight > edge.weight) {
                const backEdge = node.outEdges.get(pred);
                if (backEdge) {
                    px -= backEdge.outflow[0];
                    py -= backEdge.outflow[1];
                    pz -= backEdge.outflow[2];
                    m -= backEdge.weight;
                }
            }
        });

        const vi = [px / m, py / m, pz / m];
        let dtmax = 0;
        let vf = [0, 0, 0];
        let nbrmax = null;

        for (const nbr of neighbors[pt]) {
            if (veto.has(nbr)) continue;
            if (vetouphill && zs[nbr] > zs[pt]) continue;

            // Skip neighbors on the boundary
            if (isBoundary(pts[nbr])) continue;

            const { dt, vf: vn } = flowrate(pt, nbr, vi);
            if (dt > dtmax) {
                dtmax = dt;
                vf = vn;
                nbrmax = nbr;
            }
        }

        const outflow = [vf[0] * m, vf[1] * m, vf[2] * m];
        return { nextnode: nbrmax, outflow, m };
    }

    let qtop = flowq[0];
    let processed = 0;

    while (flowq.length > 0 || rechecks.length > 0) {
        let thisnode;

        if (rechecks.length > 0) {
            rechecks = Array.from(new Set(rechecks)).sort((a, b) => zs[b] - zs[a]);
            thisnode = rechecks.shift();
        } else {
            thisnode = flowq.shift();
            if (flowq.length > 0) {
                qtop = flowq[0];
            } else {
                qtop = null;
            }
            vetos.clear();
            visited.clear();
        }

        if (visited.has(thisnode)) {
            gr.get(thisnode).predecessors.forEach(pred => {
                if (visited.has(pred) && zs[pred] > zs[thisnode]) {
                    vetos.add(pred);
                }
            });
        }

        const node = gr.get(thisnode);

        const oldouts = Array.from(node.successors);
        oldouts.forEach(oldout => {
            node.successors.delete(oldout);
            gr.get(oldout).predecessors.delete(thisnode);
            gr.get(oldout).inEdges.delete(thisnode);
            node.outEdges.delete(oldout);

            if (qtop !== null && zs[oldout] > zs[qtop]) {
                rechecks.push(oldout);
            }
        });

        visited.add(thisnode);

        if (isBoundary(pts[thisnode])) {
            continue; // Terminate flow at boundary node
        }

        const { nextnode, outflow, m } = findOutflow(thisnode, vetos);

        if (nextnode === null) {
            continue;
        }

        node.successors.add(nextnode);
        node.outEdges.set(nextnode, { outflow: outflow, weight: m });
        gr.get(nextnode).predecessors.add(thisnode);
        gr.get(nextnode).inEdges.set(thisnode, { outflow: outflow, weight: m });
        if (qtop !== null && zs[nextnode] > zs[qtop]) {
            rechecks.push(nextnode);
        }

        processed++;
        if (processed % 1000 === 0) {
            self.postMessage({ type: 'progress', message: 'Processed ' + processed + ' nodes...' });
        }
    }

    self.postMessage({ type: 'progress', message: 'River network constructed.' });

    const edges = [];
    gr.forEach((node, i) => {
        node.successors.forEach(j => {
            const edge = node.outEdges.get(j);
            const weight = edge.weight;
            edges.push({ source: i, target: j, weight: weight });
        });
    });

    self.postMessage({ type: 'progress', message: 'Edges collected.' });

    self.postMessage({ type: 'result', edges: edges, pts: pts });
}

export default self;