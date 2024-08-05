import * as noise from './noiseFunctions';

interface Range {
    start: number;
    end: number;
}

interface NoiseConfig {
    type: string;
    zoom?: number;
    octaves?: number;
    lacunarity?: number;
    gain?: number;
    xShift?: number;
    yShift?: number;
    zShift?: number;
    frequency?: number;
    scalar?: number;
    xRange?: Range;
    yRange?: Range;
    zRange?: Range;
    seed?: number;
    transform?: number; // add to noise value
}

interface MessageData {
    seed: number;
    noiseConfigs: NoiseConfig[];
    xRange: Range;
    yRange?: Range;
    zRange?: Range;
    stepSize: number;
    getGradient?: boolean;
    get2dPitch?: boolean;
    useCumulativeGradient?: boolean; // rather than normalizing the gradients each step we can accumulate then divide by magnitude so smaller noise scales will have a smaller effect
}

declare var WorkerGlobalScope;

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = function (e: MessageEvent<MessageData>) {
        const { seed, noiseConfigs, xRange, yRange, zRange, stepSize, getGradient, get2dPitch, useCumulativeGradient } = e.data;
        // console.log(e.data);

        // Initialize noise generators
        const noiseGenerators: { [key: string]: any } = {};
        for (let config of noiseConfigs) {
            if (!noiseGenerators[config.type]) {
                noiseGenerators[config.type] = new noise[config.type](typeof config.seed === 'number' ? config.seed : seed);
            }
        }

        const { start: startX, end: endX } = xRange;
        const { start: startY, end: endY } = yRange || { start: 0, end: 0 };
        const { start: startZ, end: endZ } = zRange || { start: 0, end: 0 };

        const xCount = Math.floor((endX - startX) / stepSize) + 1;
        const yCount = Math.floor((endY - startY) / stepSize) + 1;
        const zCount = Math.floor((endZ - startZ) / stepSize) + 1;

        const numValues = xCount * yCount * zCount;
        const noiseValues = new Float32Array(numValues);
        const gradientValues = getGradient ? new Float32Array(zRange ? numValues * 3 : yRange ? numValues * 2 : numValues) : null;

        const pitch = get2dPitch ? new Float32Array(numValues) : null; // this will be slope angle created by the triangle made by dx,dy, and noise (height)

        let index = 0;
        let gradIndex = 0;
        if (zRange) { // 3D case

            const epsilonX = 1 / xCount;
            const epsilonY = 1 / yCount;
            const epsilonZ = 1 / zCount;

            for (let z = startZ; z <= endZ; z += stepSize) {
                for (let y = startY; y <= endY; y += stepSize) {
                    for (let x = startX; x <= endX; x += stepSize) {
                        let finalValue = 0;
                        let finalDx = 0, finalDy = 0, finalDz = 0;
                        let totalMag = 0;
                        for (let config of noiseConfigs) {
                            if ((!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) &&
                                (!config.yRange || (y >= config.yRange.start && y <= config.yRange.end)) &&
                                (!config.zRange || (z >= config.zRange.start && z <= config.zRange.end))) {

                                const zoom = config.zoom || 1;
                                const octaves = config.octaves || 6;
                                const lacunarity = config.lacunarity || 2.0;
                                const gain = config.gain || 0.5;
                                const xShift = config.xShift || 0;
                                const yShift = config.yShift || 0;
                                const zShift = config.zShift || 0;
                                const frequency = config.frequency || 1;

                                const generator = noiseGenerators[config.type];
                                let noiseValue = generator.generateNoise(
                                    x, y, z,
                                    zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift
                                );
                                if (config.transform) noiseValue += config.transform;
                                if (config.scalar) noiseValue *= config.scalar;
                                finalValue += noiseValue;

                                if (getGradient) {
                                    const dx = (generator.generateNoise(x + epsilonX, y, z, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift) -
                                        generator.generateNoise(x - epsilonX, y, z, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift)) / (2 * epsilonX);
                                    const dy = (generator.generateNoise(x, y + epsilonY, z, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift) -
                                        generator.generateNoise(x, y - epsilonY, z, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift)) / (2 * epsilonY);
                                    const dz = (generator.generateNoise(x, y, z + epsilonZ, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift) -
                                        generator.generateNoise(x, y, z - epsilonZ, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift)) / (2 * epsilonZ);

                                    const mag = 1 / (Math.sqrt(dx * dx + dy * dy * dz * dz) || 1); // normalize
                                    totalMag += mag;
                                    finalDx += dx;
                                    finalDy += dy;
                                    finalDz += dz;
                                }
                            }
                        }
                        noiseValues[index++] = finalValue;
                        if (gradientValues) {
                            const _l = noiseConfigs.length * totalMag;
                            gradientValues[gradIndex++] = finalDx * _l;
                            gradientValues[gradIndex++] = finalDy * _l;
                            gradientValues[gradIndex++] = finalDz * _l;
                        }
                    }
                }
            }
        } else if (yRange) { // 2D case

            const epsilonX = 1 / xCount;
            const epsilonY = 1 / yCount;

            for (let y = startY; y <= endY; y += stepSize) {
                for (let x = startX; x <= endX; x += stepSize) {
                    let finalValue = 0;
                    let finalDx = 0, finalDy = 0, finalPhi = 0;
                    let totalpitchMag = 0; let totalMag = 0;
                    for (let config of noiseConfigs) {
                        if ((!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) &&
                            (!config.yRange || (y >= config.yRange.start && y <= config.yRange.end))) {

                            const zoom = config.zoom || 1;
                            const octaves = config.octaves || 6;
                            const lacunarity = config.lacunarity || 2.0;
                            const gain = config.gain || 0.5;
                            const xShift = config.xShift || 0;
                            const yShift = config.yShift || 0;
                            const zShift = config.zShift || 0;
                            const frequency = config.frequency || 1;

                            const generator = noiseGenerators[config.type];
                            let noiseValue = generator.generateNoise(
                                x, y, 0,
                                zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift
                            );
                            if (config.transform) noiseValue += config.transform;
                            if (config.scalar) noiseValue *= config.scalar;
                            finalValue += noiseValue;

                            // todo: gravity modifier
                            if (getGradient) {
                                const zoom = config.zoom || 1.0;
                                const dx = (generator.generateNoise(x + epsilonX, y, 0, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift) -
                                    generator.generateNoise(x - epsilonX, y, 0, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift)) / (2 * epsilonX);
                                const dy = (generator.generateNoise(x, y + epsilonY, 0, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift) -
                                    generator.generateNoise(x, y - epsilonY, 0, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift)) / (2 * epsilonY);

                                if (get2dPitch && pitch) {
                                    let noiseValue2 = generator.generateNoise(x + epsilonX, y + epsilonY, 0, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift);

                                    if (config.transform) noiseValue2 += config.transform;
                                    if (config.scalar) noiseValue2 *= config.scalar;
                                    const dz = noiseValue2 - noiseValue; // this is calculating phi for a 2d slope not a 3d noise coordinate

                                    // Calculate the polar angle phi
                                    const phi = Math.acos(dz);
                                    finalPhi += phi;
                                }

                                const mag = (Math.sqrt((dx * dx + dy * dy) || 1)); // normalize
                                // different methods produce different results 
                                if (useCumulativeGradient) {
                                    totalMag += mag;
                                    finalDx += dx;
                                    finalDy += dy;
                                } else {
                                    finalDx += dx / mag;
                                    finalDy += dy / mag;
                                }
                            }
                        }
                    }
                    noiseValues[index++] = finalValue;
                    if (gradientValues) {
                        const _l = 1 / noiseConfigs.length;
                        let adjustedDx = finalDx * _l;
                        let adjustedDy = finalDy * _l;

                        // use2dPitchGravity
                        if (get2dPitch && pitch) {
                            let scaledPhi = finalPhi * _l;
                            adjustedDx *= scaledPhi;
                            adjustedDy *= scaledPhi;
                            pitch[gradIndex * 0.5] = scaledPhi;
                        }

                        if (useCumulativeGradient) {
                            adjustedDx /= totalMag; // can use cumulative results 
                            adjustedDy /= totalMag;
                        }

                        gradientValues[gradIndex++] = adjustedDx;
                        gradientValues[gradIndex++] = adjustedDy;

                    }
                }
            }
        } else { // 1D case

            const epsilonX = 1 / xCount;
            for (let x = startX; x <= endX; x += stepSize) {
                let finalValue = 0;
                let finalDx = 0;
                for (let config of noiseConfigs) {
                    if (!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) {

                        const zoom = config.zoom || 1;
                        const octaves = config.octaves || 6;
                        const lacunarity = config.lacunarity || 2.0;
                        const gain = config.gain || 0.5;
                        const xShift = config.xShift || 0;
                        const yShift = config.yShift || 0;
                        const zShift = config.zShift || 0;
                        const frequency = config.frequency || 1;

                        const generator = noiseGenerators[config.type];
                        let noiseValue = generator.generateNoise(
                            x, 0, 0,
                            zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift
                        );
                        if (config.transform) noiseValue += config.transform;
                        if (config.scalar) noiseValue *= config.scalar;
                        finalValue += noiseValue;

                        if (getGradient) {
                            const zoom = config.zoom || 1.0
                            const dx = (generator.generateNoise(x + epsilonX, 0, 0, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift) -
                                generator.generateNoise(x - epsilonX, 0, 0, zoom, frequency, octaves, lacunarity, gain, xShift, yShift, zShift)) / (2 * epsilonX);

                            finalDx += dx;
                        }
                    }
                }
                noiseValues[index++] = finalValue;
                if (gradientValues) {
                    gradientValues[gradIndex++] = finalDx / (epsilonX * noiseConfigs.length);
                }
            }
        }

        const result: any = { noiseValues };
        const transfer = [noiseValues.buffer];
        if (gradientValues) {
            result.gradientValues = gradientValues;
            transfer.push(gradientValues.buffer);

            if (pitch) {
                result.pitch = pitch;
                transfer.push(pitch.buffer);
            }
        }

        (self as any).postMessage(
            result,
            transfer
        );
    };
}

export default self as any;
