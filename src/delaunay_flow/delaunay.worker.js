//based on https://github.com/Kreswell/Small-Projects/blob/master/FlowSim.ipynb

// Import the Delaunator library for generating Delaunay triangulations. 
// This algorithm connects a set of points into a triangular mesh where each triangle 
// satisfies the Delaunay condition: no point lies inside the circumcircle of any triangle.
import Delaunator from "./Delaunator";

// Import a collection of noise generation functions. These functions are used 
// for procedural generation, creating realistic terrain features such as ridges, 
// ripples, and fractal patterns. Each noise function offers unique characteristics 
// that affect the height and structure of the generated terrain.
import { 
    BaseNoise, PerlinNoise, RidgedMultifractalNoise4, RidgeNoise, VoronoiTileNoise, 
    FractalBrownianMotion, RippleNoise, FractalRipples, FVoronoiRipple3D, 
    VoronoiBrownianMotion3, FractalBrownianMotion3, FVoronoiCircularRipple3D, 
    RidgedAntiMultifractalNoise4
} from "../noiseFunctions";

// Configure parameters for the noise function.
const zoom = 400;         // Controls the scale of the noise.
const freq = 1;           // Frequency of the noise pattern.
const octaves = 8;        // Number of layers in fractal noise.
const lacunarity = 2.0;   // Controls frequency increase between octaves.
const gain = 0.5;         // Controls amplitude reduction between octaves.

const maxEdgeLength = 0.05; //longest node length, limits boundary errors

// Set up a worker to handle messages from the main thread. This enables the web worker 
// to perform computationally intensive tasks asynchronously without blocking the main UI.
self.onmessage = function (event) {
    const data = event.data; // Access the data sent from the main thread.

    // Check the type of the received message. If it is 'start', initialize the computation.
    if (data.type === 'start') {
        // Call the main function to compute the river network, passing the number of points to generate.
        computeRiverNetwork(data.npts, data.seed1, data.seed2, data.width, data.height);
    }
};

// Main function to compute the river network.
function computeRiverNetwork(
    npts, 
    seed1 = 1122828271, 
    seed2 = 1075380921 + Date.now(),
    width = 200,
    height = 200
) {

    const rand1 = new BaseNoise(seed1);
    const noise = new RidgedMultifractalNoise4(seed2); //VoronoiTileNoise
    
    let pts = generatePoints(rand1, npts);  //generateGrid(width, height); //
    
    self.postMessage({ type: 'progress', message: 'Points generated.' });

    const zs = computeHeights(noise, pts, width, height);
    self.postMessage({ type: 'progress', message: 'Heights computed.' });

    const delaunay = Delaunator.from(pts);
    const neighbors = computeNeighbors(delaunay, pts, maxEdgeLength);
    self.postMessage({ type: 'progress', message: 'Neighbors computed.' });

    const riverEdges = constructRiverNetwork(pts, zs, neighbors);

    const size = width * height;
    const meshBuffer = new Float32Array(size * 3); // Each vertex has 3 values (x, y, z)

    let index = 0; // Index for meshBuffer
    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            const heightValue = noise.generateNoise(i, j, 0, zoom, freq, octaves, lacunarity, gain);

            // Assign vertex position to meshBuffer
            meshBuffer[index] = i;             // X coordinate
            meshBuffer[index + 1] = j;         // Y coordinate
            meshBuffer[index + 2] = heightValue; // Z coordinate (height)


            // Advance index by 3 for the next vertex
            index += 3;
        }
    }

    self.postMessage({
        type: 'result',
        edges: riverEdges,
        pts,
        meshBuffer,
        size,
    }, [meshBuffer.buffer]);
}


// Generate a specified number of random 2D points using a noise generator.
function generatePoints(rand, count) {
    const points = new Array(count); // Create an array to store the points.

    // Loop through the count and generate each point as a pair of random [x, y] coordinates.
    for (let i = 0; i < count; i++) {
        points[i] = [rand.seededRandom(), rand.seededRandom()]; // Generate values between 0 and 1.
    }

    return points; // Return the array of generated points.
}

// Generate a grid of 2D points.
function generateGrid(width, height) {
    const points = []; // Create an array to store the grid points.

    // Loop through the rows and columns to generate each grid point.
    for (let row = 0; row < width; row++) {
        for (let col = 0; col < height; col++) {
            points.push([col / (height - 1), row / (width - 1)]); // Normalize coordinates to [0, 1].
        }
    }

    return points; // Return the array of grid points.
}

// Compute heights (z-values) for each 2D point using a noise function.
function computeHeights(noise, points, width, height) {

    const heights = new Array(points.length); // Create an array to store heights.

    // Loop through each point and compute its height using the noise generator.
    for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i]; // Extract the x and y coordinates of the point.
        // Generate a height value for the point based on its coordinates and noise parameters.
        heights[i] = noise.generateNoise(x*width, y*height, 0, zoom, freq, octaves, lacunarity, gain);
    }

    return heights; // Return the array of computed heights.
}

// Compute the neighbors for each point using the Delaunay triangulation.
function computeNeighbors(delaunay, points, maxEdgeLength) {
    const neighbors = Array.from({ length: points.length }, () => []); // Initialize neighbor lists.

    const triangles = delaunay.triangles; // Access the triangulation's triangle indices.
    const nextHalfedge = (e) => (e % 3 === 2 ? e - 2 : e + 1); // Helper to find the next half-edge.

    // Iterate through each edge in the triangulation.
    for (let e = 0; e < triangles.length; e++) {
        const p = triangles[e]; // Start point of the edge.
        const q = triangles[nextHalfedge(e)]; // End point of the edge.

        // Only consider edges shorter than the specified maximum length.
        if (distance(points[p], points[q]) <= maxEdgeLength) {
            // Add the end point to the start point's neighbor list (if not already added).
            if (!neighbors[p].includes(q)) neighbors[p].push(q);
            // Add the start point to the end point's neighbor list.
            if (!neighbors[q].includes(p)) neighbors[q].push(p);
        }
    }

    return neighbors; // Return the computed neighbor lists.
}

// Compute the Euclidean distance between two points.
function distance([x1, y1], [x2, y2]) {
    const dx = x2 - x1; // Difference in x-coordinates.
    const dy = y2 - y1; // Difference in y-coordinates.
    return Math.sqrt(dx * dx + dy * dy); // Return the Euclidean distance.
}

// Construct the river network by simulating water flow across the terrain.
// This involves iterating over points, calculating flow directions, and forming
// edges based on height differences and connectivity.
function constructRiverNetwork(pts, zs, neighbors) {
    const npts = pts.length; // Total number of points in the terrain.

    const gr = initializeGraph(npts); // Initialize an empty graph for the river network.

    // Sort points by height in descending order. Points at higher elevations will be processed first.
    const indices = Array.from(zs.keys()).sort((a, b) => zs[b] - zs[a]);

    let flowq = indices.slice(); // Create a flow queue from the sorted indices.
    let rechecks = []; // Create a list of nodes that need re-evaluation for corrections.
    const visited = new Set(); // Track nodes that have already been processed.
    const vetos = new Set(); // Track nodes where flow is blocked.

    // Functions for managing the flow simulation.
    const clearOutflows = createClearOutflows(gr, zs, rechecks); // Clears outflows from a node.
    const processNode = createProcessNode(pts, zs, neighbors, gr, vetos, rechecks, visited); // Processes flow.

    // Main simulation loop: process nodes in the flow queue and rechecks.
    while (flowq.length > 0 || rechecks.length > 0) {
        // Get the next node to process, prioritizing rechecks.
        const thisnode = getNextNode(flowq, rechecks, zs);
        visited.add(thisnode); // Mark the node as visited.

        clearOutflows(thisnode); // Clear any existing outflows from the node.

        // Skip processing if the node lies on the boundary of the terrain.
        if (isBoundary(pts[thisnode])) continue;

        processNode(thisnode); // Simulate water flow from this node.
    }

    // Collect the edges of the final river network and return them.
    return collectEdges(gr);
}

// Initialize the graph structure for the river network.
// Each point in the terrain has its own node, represented as an object with:
// - predecessors: Set of nodes flowing into this node.
// - successors: Set of nodes flowing out of this node.
// - inEdges: Map of edges flowing into this node, containing flow data.
// - outEdges: Map of edges flowing out of this node, containing flow data.
function initializeGraph(npts) {
    return Array.from({ length: npts }, () => ({
        predecessors: new Set(),
        successors: new Set(),
        inEdges: new Map(),
        outEdges: new Map(),
    }));
}

// Create a function to clear all outgoing flows (outflows) from a given node.
// This ensures that any previously defined flow paths are removed before recalculating.
function createClearOutflows(gr, zs, rechecks) {
    return function clearOutflows(node) {
        const nodeData = gr[node]; // Access the graph data for this node.
        const successors = Array.from(nodeData.successors); // Get all outgoing nodes.

        // Iterate over all successors (nodes this node flows into).
        for (let i = 0; i < successors.length; i++) {
            const oldout = successors[i]; // The successor node.
            nodeData.successors.delete(oldout); // Remove the connection from successors.
            gr[oldout].predecessors.delete(node); // Remove the connection from the successor's predecessors.
            gr[oldout].inEdges.delete(node); // Remove the edge from the successor's incoming edges.
            nodeData.outEdges.delete(oldout); // Remove the edge from this node's outgoing edges.

            // If the successor node's height is higher than the current node,
            // add it to the rechecks queue for further evaluation.
            if (zs[oldout] > zs[node]) rechecks.push(oldout);
        }
    };
}

// Create a function to process a node and determine its flow direction.
// This function calculates the best downstream neighbor for a given node.
function createProcessNode(pts, zs, neighbors, gr, vetos, rechecks, visited) {
    // Create a helper function to calculate the flow rate between nodes.
    const flowrate = createFlowRate(pts, zs);

    return function processNode(node) {
        // Determine the best outflow path for the current node.
        const { nextnode, outflow, m } = findOutflow(node, pts, zs, neighbors, gr, vetos, flowrate);

        // If a valid downstream neighbor is found, update the graph to reflect the flow.
        if (nextnode !== null) {
            updateGraph(node, nextnode, gr, outflow, m, zs, rechecks);
        }
    };
}

// Calculate the flow rate between two nodes based on their positions and heights.
// The flow rate determines the time and velocity of water flowing from one node to another.
function createFlowRate(pts, zs) {
    return function flowrate(p1, p2, vel) {
        // Calculate differences in x, y, and z coordinates between the two nodes.
        const [dx, dy] = [pts[p2][0] - pts[p1][0], pts[p2][1] - pts[p1][1]];
        const dz = zs[p2] - zs[p1];

        // Compute the distance between the nodes in 3D space.
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Calculate the initial velocity component along the flow direction.
        const vi = (dx * vel[0] + dy * vel[1] + dz * vel[2]) / r;

        // Calculate the square of the final velocity using conservation of energy.
        const vfsq = vi * vi - 2 * dz;

        // If the final velocity squared is negative, the flow cannot occur.
        if (vfsq < 0) return { dt: -Infinity, vf: [0, 0, 0] };

        // Calculate the time to reach the next node and the final velocity vector.
        const dt = (vi + Math.sqrt(vfsq)) / (2 * r);
        return { dt, vf: [(dx / r) * Math.sqrt(vfsq), (dy / r) * Math.sqrt(vfsq), dz / r] };
    };
}

// Determine the best outflow direction for a given node.
// The best direction is chosen based on the steepest descent and flow properties.
function findOutflow(node, pts, zs, neighbors, gr, vetos, flowrate) {
    const nodeData = gr[node]; // Access the graph data for this node.
    let px = 0, py = 0, pz = 0, m = 1; // Initialize flow momentum and mass.

    // Combine the flow momentum from all incoming edges (predecessors).
    const predecessors = Array.from(nodeData.predecessors);
    for (let i = 0; i < predecessors.length; i++) {
        const pred = predecessors[i];
        const edge = gr[pred].outEdges.get(node); // Get the flow data for this edge.
        if (edge) {
            const { outflow, weight } = edge;
            px += outflow[0];
            py += outflow[1];
            pz += outflow[2];
            m += weight; // Accumulate the total mass.
        }
    }

    // Calculate the initial velocity vector based on the combined flow momentum.
    const vi = [px / m, py / m, pz / m];

    // Variables to track the best neighbor (steepest descent).
    let bestNeighbor = null, maxDt = -Infinity, bestOutflow = null;

    // Iterate through all neighbors of the current node.
    const nodeNeighbors = neighbors[node];
    for (let i = 0; i < nodeNeighbors.length; i++) {
        const nbr = nodeNeighbors[i];
        // Skip neighbors that are vetoed, uphill, or on the boundary.
        if (vetos.has(nbr) || zs[nbr] > zs[node] || isBoundary(pts[nbr])) continue;

        // Calculate the flow rate to this neighbor.
        const { dt, vf } = flowrate(node, nbr, vi);

        // If this neighbor offers a faster flow, update the best candidate.
        if (dt > maxDt) {
            maxDt = dt;
            bestOutflow = vf.map((v) => v * m);
            bestNeighbor = nbr;
        }
    }

    return { nextnode: bestNeighbor, outflow: bestOutflow, m }; // Return the best neighbor and flow data.
}

// Update the graph structure to reflect the new flow between two nodes.
function updateGraph(from, to, gr, outflow, weight, zs, rechecks) {
    const fromData = gr[from]; // Access the graph data for the starting node.
    const toData = gr[to];     // Access the graph data for the destination node.

    // Add the destination node to the starting node's successors.
    fromData.successors.add(to);

    // Record the outflow data for the edge from `from` to `to`.
    fromData.outEdges.set(to, { outflow, weight });

    // Add the starting node to the destination node's predecessors.
    toData.predecessors.add(from);

    // Record the inflow data for the edge from `from` to `to`.
    toData.inEdges.set(from, { outflow, weight });

    // If the destination node is higher than any recheck node, add it to the rechecks list.
    if (zs[to] > zs[rechecks[0]]) rechecks.push(to);
}

// Collect all edges in the graph and format them for output.
// Each edge contains the source node, target node, and weight (flow mass).
function collectEdges(graph) {
    const edges = [];

    // Iterate through each node in the graph.
    for (let i = 0; i < graph.length; i++) {
        const node = graph[i];
        const successors = Array.from(node.successors); // Get the node's successors.

        // Create an edge object for each connection.
        for (let j = 0; j < successors.length; j++) {
            const target = successors[j];
            const { weight } = node.outEdges.get(target); // Access the flow weight.
            edges.push({ source: i, target, weight }); // Add the edge to the output.
        }
    }

    return edges; // Return the list of edges.
}

// Check if a given point lies on the boundary of the 2D space (normalized [0, 1] range).
function isBoundary([x, y]) {
    return x <= 0 || x >= 1 || y <= 0 || y >= 1;
}

// Get the next node to process. Prioritize nodes in the rechecks list, sorted by height.
function getNextNode(flowq, rechecks, zs) {
    if (rechecks.length > 0) {
        // Sort the rechecks list by height (descending) and pop the highest node.
        rechecks.sort((a, b) => zs[b] - zs[a]);
        return rechecks.pop();
    }
    return flowq.shift(); // Otherwise, process the next node in the flow queue.
}

// Export the worker instance for external use.
export default self;
