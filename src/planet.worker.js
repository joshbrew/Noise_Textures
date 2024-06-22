import * as noise from './noiseFunctions';

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = function (e) {
        const { seed, noiseConfigs, latRange, segments, offset, offset2, randomizer1, randomizer2, randomizer3, startIndex } = e.data;

        // Initialize noise generators
        const noiseGenerators = {};
        for (let config of noiseConfigs) {
            if (!noiseGenerators[config.type]) {
                noiseGenerators[config.type] = new noise[config.type](seed);
            }
        }

        const { startLat, endLat } = latRange;
        const numValues = (endLat - startLat + 1) * (segments + 1);
        const noiseValues = new Float32Array(numValues);
        const coordinates = new Float32Array(numValues * 3); // XYZ coordinates
        let index = 0;

        for (let lat = startLat; lat <= endLat; lat++) {
            const theta = lat * Math.PI / segments;
            const poleScaleLat = Math.sin(theta);

            for (let lon = 0; lon <= segments; lon++) {
                const phi = lon * 2 * Math.PI / segments;
                const poleScaleLon = Math.sin(phi);

                const x = Math.sin(theta) * Math.cos(phi);
                const y = Math.sin(theta) * Math.sin(phi);
                const z = Math.cos(theta);

                const cIdx = index * 3;
                coordinates[cIdx] = x;
                coordinates[cIdx + 1] = y;
                coordinates[cIdx + 2] = z;

                let noiseX = x + 2 + poleScaleLat * poleScaleLon * (offset * Math.sin(phi + theta) + offset2 * Math.cos(2 * phi));
                let noiseY = y + 2 + poleScaleLat * poleScaleLon * (offset * Math.cos(theta + phi) + offset2 * Math.sin(2 * theta));
                let noiseZ = z + 2 + poleScaleLat * poleScaleLon * (offset * Math.sin(2 * phi + theta) + offset2 * Math.cos(2 * theta + phi));

                let finalValue = 0;
                for (let config of noiseConfigs) {
                    const generator = noiseGenerators[config.type];
                    finalValue += generator.generateNoise(
                        noiseX, noiseY, noiseZ,
                        config.zoom || 1.0,
                        config.octaves || 6,
                        config.lacunarity || 2.0,
                        config.gain || 0.5,
                        config.shift || 100,
                        config.frequency || 1
                    );
                }

                noiseValues[index++] = finalValue;
            }
        }

        self.postMessage({
            noiseValues,
            coordinates,
            startIndex
        }, [noiseValues.buffer, coordinates.buffer]);
    };
}

export default self;
