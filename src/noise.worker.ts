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
    seed?: number;
    transform?: number; //add to noise value
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
}

declare var WorkerGlobalScope;

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = function (e: MessageEvent<MessageData>) {
        const { seed, noiseConfigs, xRange, yRange, zRange, stepSize, getGradient, get2dPitch } = e.data;
        //console.log(e.data);

        const epsilon = 0.0001;

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

        const pitch = get2dPitch ? new Float32Array(numValues) : null; //this will be slope angle created by the triangle made by dx,dy, and noise (height)

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

                                const zoom = config.zoom || 1;
                                const octaves = config.octaves || 6;
                                const lacunarity = config.lacunarity || 2.0;
                                const gain = config.gain || 0.5;
                                const shift = config.shift || 0; 
                                const frequency = config.frequency || 1;

                                const generator = noiseGenerators[config.type];
                                let noiseValue = generator.generateNoise(
                                    x, y, z,
                                    zoom, octaves, lacunarity, gain, shift, frequency
                                );
                                if (config.transform) noiseValue += config.transform;
                                if (config.scalar) noiseValue *= config.scalar;
                                finalValue += noiseValue;

                                if (getGradient) {
                                    const dx = (generator.generateNoise(x + epsilon, y, z, zoom, octaves, lacunarity, gain, shift, frequency) -
                                                generator.generateNoise(x - epsilon, y, z, zoom, octaves, lacunarity, gain, shift, frequency)) / (2 * epsilon);
                                    const dy = (generator.generateNoise(x, y + epsilon, z, zoom, octaves, lacunarity, gain, shift, frequency) -
                                                generator.generateNoise(x, y - epsilon, z, zoom, octaves, lacunarity, gain, shift, frequency)) / (2 * epsilon);
                                    const dz = (generator.generateNoise(x, y, z + epsilon, zoom, octaves, lacunarity, gain, shift, frequency) -
                                                generator.generateNoise(x, y, z - epsilon, zoom, octaves, lacunarity, gain, shift, frequency)) / (2 * epsilon);
                                    
                                    const _mag = 1/(Math.sqrt(dx*dx+dy*dy*dz*dz) || 1); //normalize
                                    //const _mag = 1/(2*zoom*epsilon);
                                    
                                    finalDx += dx*_mag;
                                    finalDy += dy*_mag;
                                    finalDz += dz*_mag;
                                }
                            }
                        }
                        noiseValues[index++] = finalValue;
                        if (gradientValues) {
                            gradientValues[gradIndex++] = finalDx/noiseConfigs.length;
                            gradientValues[gradIndex++] = finalDy/noiseConfigs.length;
                            gradientValues[gradIndex++] = finalDz/noiseConfigs.length;
                        }
                    }
                }
            }
        } else if (yRange) { // 2D case
            for (let y = startY; y <= endY; y += stepSize) {
                for (let x = startX; x <= endX; x += stepSize) {
                    let finalValue = 0;
                    let finalDx = 0, finalDy = 0, finalPhi = 0;
                    for (let config of noiseConfigs) {
                        if ((!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) &&
                            (!config.yRange || (y >= config.yRange.start && y <= config.yRange.end))) {

                            const zoom = config.zoom || 1;
                            const octaves = config.octaves || 6;
                            const lacunarity = config.lacunarity || 2.0;
                            const gain = config.gain || 0.5;
                            const shift = config.shift || 0; 
                            const frequency = config.frequency || 1;

                            const generator = noiseGenerators[config.type];
                            let noiseValue = generator.generateNoise(
                                x, y, 0,
                                zoom, octaves, lacunarity, gain, shift, frequency
                            );
                            if (config.transform) noiseValue += config.transform;
                            if (config.scalar) noiseValue *= config.scalar;
                            finalValue += noiseValue;

                            if (getGradient) {
                                const zoom = config.zoom || 1.0;
                                const dx = (generator.generateNoise(x + epsilon, y, 0, zoom, octaves, lacunarity, gain, shift, frequency) -
                                            generator.generateNoise(x - epsilon, y, 0, zoom, octaves, lacunarity, gain, shift, frequency)) / (2 * epsilon);
                                const dy = (generator.generateNoise(x, y + epsilon, 0, zoom, octaves, lacunarity, gain, shift, frequency) -
                                            generator.generateNoise(x, y - epsilon, 0, zoom, octaves, lacunarity, gain, shift, frequency)) / (2 * epsilon);
                                
                                if(get2dPitch && pitch) {
                                    const noiseValue2 = generator.generateNoise(x+dx, y+dy, 0, zoom, octaves, lacunarity, gain, shift, frequency);
                                    const dz = noiseValue - noiseValue2; //this is calculating phi for a 2d slope not a 3d noise coordinate
                                    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
                                    // Calculate the polar angle phi
                                    const phi = Math.acos(dz / magnitude);
                                    finalPhi += phi;
                                }


                                const _mag = 1/(Math.sqrt(dx*dx+dy*dy) || 1); //normalize
                                //const _mag = 1/(2*zoom*epsilon);
                                finalDx += dx*_mag;
                                finalDy += dy*_mag;

                            }
                        }
                    }
                    noiseValues[index++] = finalValue;
                    if (gradientValues) {
                        const _l = 1/noiseConfigs.length;
                        gradientValues[gradIndex++] = finalDx*_l;
                        gradientValues[gradIndex++] = finalDy*_l;

                        if(get2dPitch && pitch) {
                            pitch[gradIndex*0.5] = finalPhi*_l; 
                        }
                    }
                }
            }
        } else { // 1D case
            for (let x = startX; x <= endX; x += stepSize) {
                let finalValue = 0;
                let finalDx = 0;
                for (let config of noiseConfigs) {
                    if (!config.xRange || (x >= config.xRange.start && x <= config.xRange.end)) {
                        
                        const zoom = config.zoom || 1;
                        const octaves = config.octaves || 6;
                        const lacunarity = config.lacunarity || 2.0;
                        const gain = config.gain || 0.5;
                        const shift = config.shift || 0; 
                        const frequency = config.frequency || 1;

                        const generator = noiseGenerators[config.type];
                        let noiseValue = generator.generateNoise(
                            x, 0, 0,
                            zoom, octaves, lacunarity, gain, shift, frequency
                        );
                        if (config.transform) noiseValue += config.transform;
                        if (config.scalar) noiseValue *= config.scalar;
                        finalValue += noiseValue;

                        if (getGradient) {
                            const zoom = config.zoom || 1.0
                            const dx = (generator.generateNoise(x + epsilon, 0, 0, zoom, octaves, lacunarity, gain, shift, frequency) -
                                        generator.generateNoise(x - epsilon, 0, 0, zoom, octaves, lacunarity, gain, shift, frequency)) / (2 * epsilon);

                            finalDx += dx/(2*zoom*epsilon);
                        }
                    }
                }
                noiseValues[index++] = finalValue;
                if (gradientValues) {
                    gradientValues[gradIndex++] = finalDx/noiseConfigs.length;
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