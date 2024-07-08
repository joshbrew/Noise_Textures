import * as noise from '../noiseFunctions';
import planetworker from '../planet.worker';
import * as gradientChoices from './planetGradients'

export async function generatePlanetVertices(noiseConfigs, seed, segments, radius) {
    const numWorkers = navigator.hardwareConcurrency || 4;
    const workers = [];
    const segmentSize = Math.ceil(segments / numWorkers);

    for (let i = 0; i < numWorkers; i++) {
        workers[i] = new Worker(planetworker);
    }

    const promises = [];
    const numVertices = (segments + 1) * (segments + 1);
    const totalNoiseValues = numVertices;
    const noiseValues = new Float32Array(totalNoiseValues);
    const coordinates = new Float32Array(totalNoiseValues * 3);

    for (let i = 0; i < numWorkers; i++) {
        const start = i * segmentSize;
        let end = (i + 1) * segmentSize - 1;

        if (end > segments) end = segments;

        promises.push(new Promise((resolve) => {
            workers[i].onmessage = function (e) {
                const { noiseValues: workerNoiseValues, coordinates: workerCoordinates, startIndex } = e.data;
                noiseValues.set(workerNoiseValues, startIndex);
                coordinates.set(workerCoordinates, startIndex * 3);
                workers[i].terminate();
                resolve();
            };

            workers[i].postMessage({
                seed,
                noiseConfigs,
                latRange: { start, end },
                segments,
                startIndex: start * (segments + 1)
            });
        }));
    }

    await Promise.all(promises);

    return { noiseValues, coordinates, numVertices };
}

export async function createPlanetVertices(segments = 1000, radius = 50, gradientColors=gradientChoices.gradientColorsVolcanic) {
    let noiseGen = new noise.BaseNoise();

    if (!gradientColors) {
        // Default gradient choices
        let gradientChoices = [
            [0,0,0],
            [255,255,255]
        ];
        gradientColors = gradientChoices[Math.floor(Math.random() * gradientChoices.length)];
    }

    let SEED = 12345 + (Math.random() - 0.5);

    let offset = noiseGen.seededRandom() * 0.3;
    let offset2 = noiseGen.seededRandom() * 0.1;
    let sign = noiseGen.seededRandom() - 0.5;
    let sign2 = noiseGen.seededRandom() - 0.5;

    let randomizer1 = Math.random() * 0.4 - 0.2;
    let randomizer2 = Math.random() * 0.2 - 0.1;
    let randomizer3 = Math.random() * 0.2 - 0.1;

    if (sign < 0) sign = -1;
    else sign = 1;
    offset *= sign;
    if (sign2 < 0) sign2 = -1;
    else sign2 = 1;
    offset2 *= sign2;

    const zoomFactor = 1.3;

    const noiseConfigs = [
        { type: 'FractalBrownianMotion', scalar: 0.75, zoom: zoomFactor * 0.8, octaves: 6, lacunarity: 2.0, gain: 0.5, shift: randomizer3 + 2.0, frequency: 1, offset: offset, offset2:offset2 },
        { type: 'FractalBrownianMotion2', scalar: 0.75, zoom: zoomFactor * 1, octaves: 8, lacunarity: 2.0, gain: 0.5, shift: randomizer3 + 1.3, frequency: 1, offset: offset, offset2:offset2 },
        //{ type: 'VoronoiTileNoise', scalar: 0.9, zoom: zoomFactor * 0.35, octaves: 2, lacunarity: 2, gain: 0.5, shift: randomizer1 + 1.3 * 0.5, frequency: 1, offset: offset, offset2:offset2 },
        { type: 'RidgedMultifractalNoise4', zoom: zoomFactor * 0.2, octaves: 6, lacunarity: 2.1, gain: 0.5, shift: randomizer1 + 1.3 * 0.5, frequency: 1, offset: offset, offset2:offset2 },
        { type: 'LanczosBillowNoise', zoom: zoomFactor * 0.5, octaves: 6, lacunarity: 2.0, gain: 0.5, shift: randomizer2 + 1.3 * 0.5, frequency: 1, offset: offset, offset2:offset2 }
    ];

    const { noiseValues, coordinates, numVertices } = await generatePlanetVertices(noiseConfigs, SEED, segments, radius);

    return { noiseValues, coordinates, numVertices, radius, segments, gradientColors };
}

//we are partitioning due to webgpu buffering limits in case we want a gazillion vertices
export function createPlanetMeshPartitions() {

    const SPLIT_POSITION_COUNT = 8000000; // Number of positions per split
    const VERTEX_SIZE = 3; // positions
    const NORMAL_SIZE = 3; // normals
    const UV_SIZE = 2; // uvs
    const COLOR_SIZE = 4; // colors
    const INDEX_SIZE = 6; // indices per triangle

    // Calculate the number of vertices per split
    const verticesPerSplit = SPLIT_POSITION_COUNT / VERTEX_SIZE;
    //const numVertices = (segments + 1) * (segments + 1);
    const numSplits = Math.ceil(numVertices / verticesPerSplit);

    let meshes = [];
    
    // Partition the vertices and indices
    for (let i = 0; i < numSplits; i++) {
        const startLat = i * Math.floor(verticesPerSplit / (segments + 1));
        const endLat = Math.min((i + 1) * Math.floor(verticesPerSplit / (segments + 1)), segments);

        // Preallocate the arrays for this partition
        const numVertsInSegment = (endLat - startLat + 1) * (segments + 1);
        const splitPositions = new Float32Array(numVertsInSegment * VERTEX_SIZE);
        const splitNormals = new Float32Array(numVertsInSegment * NORMAL_SIZE);
        const splitColors = new Float32Array(numVertsInSegment * COLOR_SIZE);
        const splitUvs = new Float32Array(numVertsInSegment * UV_SIZE);
        const splitIndices = new Uint32Array((endLat - startLat) * segments * INDEX_SIZE);

        let vertexOffset = 0;
        let indexOffset = 0;

        for (let lat = startLat; lat <= endLat; lat++) {
            for (let lon = 0; lon <= segments; lon++) {
                const noiseIndex = lat * (segments + 1) + lon;
                const noiseValue = noiseValues[noiseIndex];

                const index3 = vertexOffset * VERTEX_SIZE;
                const index4 = vertexOffset * COLOR_SIZE;
                const index2 = vertexOffset * UV_SIZE;

                const x = coordinates[noiseIndex * VERTEX_SIZE];
                const y = coordinates[noiseIndex * VERTEX_SIZE + 1];
                const z = coordinates[noiseIndex * VERTEX_SIZE + 2];

                const heightValue = noiseValue * 1.5;
                const nx = x * radius + x * heightValue;
                const ny = y * radius + y * heightValue;
                const nz = z * radius + z * heightValue;

                splitPositions[index3] = nx;
                splitPositions[index3 + 1] = nz; //z and y are flipped due to bab's left handed system
                splitPositions[index3 + 2] = ny;

                splitNormals[index3] = x;
                splitNormals[index3 + 1] = z;
                splitNormals[index3 + 2] = y;

                const baseColor = !isNaN(noiseValue) ? getColor(noiseValue) : [1, 1, 1];
                const [r, g, b] = baseColor;
                splitColors[index4] = r / 255;
                splitColors[index4 + 1] = g / 255;
                splitColors[index4 + 2] = b / 255;
                splitColors[index4 + 3] = 1;

                splitUvs[index2] = lon / segments;
                splitUvs[index2 + 1] = lat / segments;

                vertexOffset++;
            }
        }

        // Adjust the indices for the current split
        for (let lat = startLat; lat < endLat; lat++) {
            for (let lon = 0; lon < segments; lon++) {
                const first = (lat - startLat) * (segments + 1) + lon;
                const second = first + segments + 1;

                const index = indexOffset * INDEX_SIZE;

                splitIndices[index] = first;
                splitIndices[index + 1] = second;
                splitIndices[index + 2] = first + 1;
                splitIndices[index + 3] = second;
                splitIndices[index + 4] = second + 1;
                splitIndices[index + 5] = first + 1;

                indexOffset++;
            }
        }

        // Create the mesh for this partition
        //createMesh(splitPositions, splitNormals, splitColors, splitUvs, splitIndices, i);

        meshes.push({
            splitPositions:splitPositions, splitNormals:splitNormals, splitColors:splitColors, splitUvs:splitUvs, splitIndices:splitIndices, i:i
        });

    }

    return meshes;
}