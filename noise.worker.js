
import * as noise from './noiseFunctions'


if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const billow = new noise.LanczosBillowNoise(12345); // Set a seed for reproducibility
    const ridged = new noise.RidgedMultifractalNoise(12345); // Set a seed for reproducibility
    const fbm = new noise.FractalBrownianMotion(12345); // Set a seed for reproducibility
    const fbm2 = new noise.FractalBrownianMotion2(12345); // Set a seed for reproducibility

    let useRidged = billow.seededRandom() - 0.5 > 0;
    let useFBM2 = billow.seededRandom() - 0.5 > 0; //coin toss to use more noise

    //todo, make it so we can create any sets of noise functions and provide call params
    self.onmessage = function (e) {
        if(e.data.seed) {
            billow.setSeed(e.data.seed);
            ridged.setSeed(e.data.seed);
            fbm.setSeed(e.data.seed);
            fbm2.setSeed(e.data.seed);

            useRidged = billow.seededRandom() - 0.5 > 0;
            useFBM2 = billow.seededRandom() - 0.5 > 0;

            return;
        }
        const { latRange, segments, offset, offset2, randomizer1, randomizer2, randomizer3, startIndex } = e.data;
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

                //would be smarter to feed these to the worker instead but we are just doing sphere generators
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

                let zoomMul = 1.3;

                const noiseValue = fbm.generateNoise(noiseX, noiseY, noiseZ, zoomMul * 0.8, 6, randomizer3 + 2.0, 0.5, 0, 1) -
                    (useFBM2 ? fbm2.generateNoise(noiseX, noiseY, noiseZ, randomizer3 + zoomMul * 1, 8, 2, 0.5, 0, 1) : 0) +
                    (useRidged ? (ridged.generateNoise(noiseX, noiseY, noiseZ, randomizer1 + zoomMul * 0.5, 6, 2.0, 0.5, 0, 1)) : 0) +
                    billow.generateNoise(noiseY, noiseX, noiseZ, randomizer2 + zoomMul * 0.5, 6, 2.0, 0.5, 0, 1) * 1.2 - 0.2;

                noiseValues[index++] = noiseValue;
            }
        }

        self.postMessage({ noiseValues, coordinates, startIndex }, [noiseValues.buffer, coordinates.buffer]);
    };
}


export default self;