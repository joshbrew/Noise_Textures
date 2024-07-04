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
    latRange: Range;
    segments: number;
    offset: number;
    offset2: number;
    randomizer1: number;
    randomizer2: number;
    randomizer3: number;
    startIndex: number;
}

declare var WorkerGlobalScope;

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = function (e: MessageEvent<MessageData>) {
        const { seed, noiseConfigs, latRange, segments, offset, offset2, startIndex } = e.data;

        // Initialize noise generators
        const noiseGenerators: { [key: string]: any } = {};
        for (let config of noiseConfigs) {
            if (!noiseGenerators[config.type]) {
                noiseGenerators[config.type] = new noise[config.type](seed);
            }
        }

        const { start: startLat, end: endLat } = latRange;
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
                    if ((!config.xRange || (noiseX >= config.xRange.start && noiseX <= config.xRange.end)) &&
                        (!config.yRange || (noiseY >= config.yRange.start && noiseY <= config.yRange.end)) &&
                        (!config.zRange || (noiseZ >= config.zRange.start && noiseZ <= config.zRange.end))) {

                        const generator = noiseGenerators[config.type];
                        let noiseValue = generator.generateNoise(
                            noiseX, noiseY, noiseZ,
                            config.zoom || 1.0,
                            config.octaves || 6,
                            config.lacunarity || 2.0,
                            config.gain || 0.5,
                            config.shift || 100,
                            config.frequency || 1
                        );
                        if (config.scalar) noiseValue *= config.scalar;
                        finalValue += noiseValue;
                    }
                }

                noiseValues[index++] = finalValue;
            }
        }

        (self as any).postMessage({
            noiseValues,
            coordinates,
            startIndex
        }, [noiseValues.buffer, coordinates.buffer]);
    };
}

export default self as any;
