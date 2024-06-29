import * as noise from './noiseFunctions';

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = function (e) {
        const { seed, noiseConfigs, xRange, yRange, zRange, stepSize } = e.data;

        // Initialize noise generators
        const noiseGenerators = {};
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

        let index = 0;
        if (zRange) { // 3D case
            for (let z = startZ; z <= endZ; z += stepSize) {
                for (let y = startY; y <= endY; y += stepSize) {
                    for (let x = startX; x <= endX; x += stepSize) {
                        let finalValue = 0;
                        for (let config of noiseConfigs) {
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
                            if(config.scalar) noiseValue *= config.scalar
                            finalValue += noiseValue;
                        }
                        noiseValues[index++] = finalValue;
                    }
                }
            }
        } else if (yRange) { // 2D case
            for (let y = startY; y <= endY; y += stepSize) {
                for (let x = startX; x <= endX; x += stepSize) {
                    let finalValue = 0;
                    for (let config of noiseConfigs) {
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
                        if(config.scalar) noiseValue *= config.scalar
                        finalValue += noiseValue;
                    }
                    noiseValues[index++] = finalValue;
                }
            }
        } else { // 1D case
            for (let x = startX; x <= endX; x += stepSize) {
                let finalValue = 0;
                for (let config of noiseConfigs) {
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
                    if(config.scalar) noiseValue *= config.scalar
                    finalValue += noiseValue;
                }
                noiseValues[index++] = finalValue;
            }
        }

        self.postMessage({ noiseValues }, [noiseValues.buffer]);
    };
}

export default self;
