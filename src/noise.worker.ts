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
    shift?: number;
    frequency?: number;
    scalar?: number;
    xRange?: Range;
    yRange?: Range;
    zRange?: Range;
}

interface MessageData {
    seed: number;
    noiseConfigs: NoiseConfig[];
    xRange: Range;
    yRange?: Range;
    zRange?: Range;
    stepSize: number;
    getGradient?: boolean;
}

declare var WorkerGlobalScope;

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = function (e: MessageEvent<MessageData>) {
        const { seed, noiseConfigs, xRange, yRange, zRange, stepSize, getGradient } = e.data;
        //console.log(e.data);

        const epsilon = 0.0001;

        // Initialize noise generators
        const noiseGenerators: { [key: string]: any } = {};
        for (let config of noiseConfigs) {
            if (!noiseGenerators[config.type]) {
                noiseGenerators[config.type] = new noise[config.type](seed);
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

        let index = 0;
        let gradIndex = 0;
        if (zRange) { // 3D case
            for (let z = startZ; z <= endZ; z += stepSize) {
                for (let y = startY; y <= endY; y += stepSize) {
                    for (let x = startX; x <= endX; x += stepSize) {
                        let finalValue = 0;
                        let finalDx = 0, finalDy = 0, finalDz = 0;
                        for (let config of noiseConfigs) {
                            if ((!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) &&
                                (!config.yRange || (y >= config.yRange.start && y <= config.yRange.end)) &&
                                (!config.zRange || (z >= config.zRange.start && z <= config.zRange.end))) {

                                const generator = noiseGenerators[config.type];
                                let noiseValue = generator.generateNoise(
                                    x, y, z,
                                    config.zoom || 1.0,
                                    config.octaves || 6,
                                    config.lacunarity || 2.0,
                                    config.gain || 0.5,
                                    config.shift || 100,
                                    config.frequency || 1
                                );
                                if (config.scalar) noiseValue *= config.scalar;
                                finalValue += noiseValue;

                                if (getGradient) {
                                    const dx = (generator.generateNoise(x + epsilon, y, z, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1) -
                                                generator.generateNoise(x - epsilon, y, z, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1)) / (2 * epsilon);
                                    const dy = (generator.generateNoise(x, y + epsilon, z, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1) -
                                                generator.generateNoise(x, y - epsilon, z, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1)) / (2 * epsilon);
                                    const dz = (generator.generateNoise(x, y, z + epsilon, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1) -
                                                generator.generateNoise(x, y, z - epsilon, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1)) / (2 * epsilon);
                                    
                                    const _mag = 1/Math.sqrt(dx*dx+dy*dy*dz*dz); //normalize
                                    
                                    finalDx += dx*_mag;
                                    finalDy += dy*_mag;
                                    finalDz += dz*_mag;
                                }
                            }
                        }
                        noiseValues[index++] = finalValue;
                        if (gradientValues) {
                            gradientValues[gradIndex++] = finalDx;
                            gradientValues[gradIndex++] = finalDy;
                            gradientValues[gradIndex++] = finalDz;
                        }
                    }
                }
            }
        } else if (yRange) { // 2D case
            for (let y = startY; y <= endY; y += stepSize) {
                for (let x = startX; x <= endX; x += stepSize) {
                    let finalValue = 0;
                    let finalDx = 0, finalDy = 0;
                    for (let config of noiseConfigs) {
                        if ((!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) &&
                            (!config.yRange || (y >= config.yRange.start && y <= config.yRange.end))) {

                            const generator = noiseGenerators[config.type];
                            let noiseValue = generator.generateNoise(
                                x, y, 0,
                                config.zoom || 1.0,
                                config.octaves || 6,
                                config.lacunarity || 2.0,
                                config.gain || 0.5,
                                config.shift || 100,
                                config.frequency || 1
                            );
                            if (config.scalar) noiseValue *= config.scalar;
                            finalValue += noiseValue;

                            if (getGradient) {
                                const dx = (generator.generateNoise(x + epsilon, y, 0, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1) -
                                            generator.generateNoise(x - epsilon, y, 0, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1)) / (2 * epsilon);
                                const dy = (generator.generateNoise(x, y + epsilon, 0, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1) -
                                            generator.generateNoise(x, y - epsilon, 0, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1)) / (2 * epsilon);
                                
                                const _mag = 1/Math.sqrt(dx*dx+dy*dy); //normalize
                                            
                                finalDx += dx*_mag;
                                finalDy += dy*_mag;

                            }
                        }
                    }
                    noiseValues[index++] = finalValue;
                    if (gradientValues) {
                        gradientValues[gradIndex++] = finalDx;
                        gradientValues[gradIndex++] = finalDy;
                    }
                }
            }
        } else { // 1D case
            for (let x = startX; x <= endX; x += stepSize) {
                let finalValue = 0;
                let finalDx = 0;
                for (let config of noiseConfigs) {
                    if (!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) {
                        
                        const generator = noiseGenerators[config.type];
                        let noiseValue = generator.generateNoise(
                            x, 0, 0,
                            config.zoom || 1.0,
                            config.octaves || 6,
                            config.lacunarity || 2.0,
                            config.gain || 0.5,
                            config.shift || 100,
                            config.frequency || 1
                        );
                        if (config.scalar) noiseValue *= config.scalar;
                        finalValue += noiseValue;

                        if (getGradient) {
                            const dx = (generator.generateNoise(x + epsilon, 0, 0, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1) -
                                        generator.generateNoise(x - epsilon, 0, 0, config.zoom || 1.0, config.octaves || 6, config.lacunarity || 2.0, config.gain || 0.5, config.shift || 100, config.frequency || 1)) / (2 * epsilon);
                            finalDx += dx;
                        }
                    }
                }
                noiseValues[index++] = finalValue;
                if (gradientValues) {
                    gradientValues[gradIndex++] = finalDx;
                }
            }
        }

        const result: any = { noiseValues };
        if (gradientValues) result.gradientValues = gradientValues;

        (self as any).postMessage(result, gradientValues ? [noiseValues.buffer, gradientValues.buffer] : [noiseValues.buffer]);
    };
}

export default self as any;