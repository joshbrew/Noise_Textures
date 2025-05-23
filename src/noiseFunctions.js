class BaseNoise {

    constructor(seed = Date.now()) {
        if(seed < 1000) seed *= 10000; //need a bigger number
        this.seedN = seed;
        this.seedK = seed;
        this.perm = new Uint8Array(512);
        this.seed(seed);
    }

    seed(seed) {
        const random = this.xorshift(seed);
        for (let i = 0; i < 256; i++) {
            this.perm[i] = i;
        }
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
        }
        for (let i = 0; i < 256; i++) {
            this.perm[i + 256] = this.perm[i];
        }
    }

    setSeed(seed) {
        this.seedN = seed;
        this.seed(seed);
        this.resetSeed();
    }

    random(x, y, z) {
        let idx;
        if(typeof z === 'number') idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        else idx = (this.perm[(x & 255) + this.perm[y & 255]]) & 255;
        return ((this.perm[idx] / 255) * 2 - 1);
    }

    seededRandom() {
        this.seedK += Math.E;
        const x = 1000000000 * Math.sin(this.seedK);
        return x - Math.floor(x);
    }

    resetSeed() {
        this.seedK = this.seedN;
    }

    xorshift(seed) {
        let x = seed;
        return function () {
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            return (x < 0 ? 1 + ~x : x) / 0xFFFFFFFF; //(x >>> 0) for different result
        };
    }

    dot(g, x = 0, y = 0, z = 0) {
        return g[0] * x + g[1] * y + g[2] * z;
    }
}

class Noise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
        this.grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
    }

    fade(t) {
        return t * t * t * t * (t * (t * (70 - 20 * t) - 84) + 35);
    }

    mix(a, b, t) {
        return (1 - t) * a + t * b;
    }

    noise(x, y=0, z=0) {
        let X = Math.floor(x) & 255;
        let Y = Math.floor(y) & 255;
        let Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        let u = this.fade(x);
        let v = this.fade(y);
        let w = this.fade(z);

        let A = this.perm[X] + Y;
        let AA = this.perm[A] + Z;
        let AB = this.perm[A + 1] + Z;
        let B = this.perm[X + 1] + Y;
        let BA = this.perm[B] + Z;
        let BB = this.perm[B + 1] + Z;

        return this.mix(this.mix(this.mix(this.dot(this.grad3[this.perm[AA] % 12], x, y, z),
            this.dot(this.grad3[this.perm[BA] % 12], x - 1, y, z), u),
            this.mix(this.dot(this.grad3[this.perm[AB] % 12], x, y - 1, z),
                this.dot(this.grad3[this.perm[BB] % 12], x - 1, y - 1, z), u), v),
            this.mix(this.mix(this.dot(this.grad3[this.perm[AA + 1] % 12], x, y, z - 1),
                this.dot(this.grad3[this.perm[BA + 1] % 12], x - 1, y, z - 1), u),
                this.mix(this.dot(this.grad3[this.perm[AB + 1] % 12], x, y - 1, z - 1),
                    this.dot(this.grad3[this.perm[BB + 1] % 12], x - 1, y - 1, z - 1), u), v), w);
    }
}

class SimplexNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
        this.grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
    }

    noise(xin, yin) {
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        let n0, n1, n2; // Noise contributions from the three corners

        // Skew the input space to determine which simplex cell we're in
        const s = (xin + yin) * F2; // Hairy factor for 2D
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const X0 = i - t; // Unskew the cell origin back to (x,y) space
        const Y0 = j - t;
        const x0 = xin - X0; // The x,y distances from the cell origin
        const y0 = yin - Y0;

        // For the 2D case, the simplex shape is an equilateral triangle.
        // Determine which simplex we are in.
        let i1, j1; // Offsets for the second (middle) corner of simplex in (i,j) coordinates
        if (x0 > y0) { // Lower triangle, XY order: (0,0)->(1,0)->(1,1)
            i1 = 1;
            j1 = 0;
        } else { // Upper triangle, YX order: (0,0)->(0,1)->(1,1)
            i1 = 0;
            j1 = 1;
        }

        // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
        // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
        // c = (3-sqrt(3))/6

        const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coordinates
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coordinates
        const y2 = y0 - 1.0 + 2.0 * G2;

        // Work out the hashed gradient indices of the three simplex corners
        const ii = i & 255;
        const jj = j & 255;
        const gi0 = this.perm[ii + this.perm[jj]] % 12;
        const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
        const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;

        // Calculate the contribution from the three corners
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0); // (x,y) of grad3 used for 2D gradient
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);
        }

        // Add contributions from each corner to get the final noise value.
        // The result is scaled to return values in the interval [-1,1].
        return 70.0 * (n0 + n1 + n2);
    }
}

class SimplexNoise3D extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
        this.grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
        this.grad4 = [
            [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
            [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
            [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
            [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
            [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
            [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
            [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
            [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0]
        ];
    }

    dot(g, x, y, z) {
        return g[0] * x + g[1] * y + g[2] * z;
    }

    noise(xin, yin, zin=0) {
        const F3 = 1.0 / 3.0;
        const G3 = 1.0 / 6.0;
        let n0, n1, n2, n3; // Noise contributions from the four corners

        // Skew the input space to determine which simplex cell we're in
        const s = (xin + yin + zin) * F3; // Hairy factor for 3D
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const k = Math.floor(zin + s);
        const t = (i + j + k) * G3;
        const X0 = i - t; // Unskew the cell origin back to (x,y,z) space
        const Y0 = j - t;
        const Z0 = k - t;
        const x0 = xin - X0; // The x,y,z distances from the cell origin
        const y0 = yin - Y0;
        const z0 = zin - Z0;

        // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
        // Determine which simplex we are in.
        let i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
        let i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords
        if (x0 >= y0) {
            if (y0 >= z0) {
                // X Y Z order
                i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
            } else if (x0 >= z0) {
                // X Z Y order
                i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
            } else {
                // Z X Y order
                i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
            }
        } else {
            if (y0 < z0) {
                // Z Y X order
                i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
            } else if (x0 < z0) {
                // Y Z X order
                i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
            } else {
                // Y X Z order
                i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
            }
        }

        // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z), and
        // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
        // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
        // c = 1/6.
        const x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) unskewed coords
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) unskewed coords
        const y2 = y0 - j2 + 2.0 * G3;
        const z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) unskewed coords
        const y3 = y0 - 1.0 + 3.0 * G3;
        const z3 = z0 - 1.0 + 3.0 * G3;

        // Work out the hashed gradient indices of the four simplex corners
        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;
        const gi0 = this.perm[ii + this.perm[jj + this.perm[kk]]] % 12;
        const gi1 = this.perm[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]] % 12;
        const gi2 = this.perm[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]] % 12;
        const gi3 = this.perm[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]] % 12;

        // Calculate the contribution from the four corners
        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0, z0);
        }

        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1, z1);
        }

        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2, z2);
        }

        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
        if (t3 < 0) n3 = 0.0;
        else {
            t3 *= t3;
            n3 = t3 * t3 * this.dot(this.grad3[gi3], x3, y3, z3);
        }

        // Add contributions from each corner to get the final noise value.
        // The result is scaled to return values in the interval [-1,1].
        return 32.0 * (n0 + n1 + n2 + n3);
    }
}

class LanczosNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
        this.lanczosX = new Float32Array(6);
        this.lanczosY = new Float32Array(6);
    }

    lanczos(t) {
        if (t === 0) {
            return 1;
        } else if (t > 4 || t < -4) {
            return 0;
        }
        return 3 * (Math.sin(Math.PI * t) * Math.sin(Math.PI * (t / 3)) / (Math.PI * Math.PI * t * t));
    }

    noise(x, y, z) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iz = Math.floor(z);

        const dx = x - ix;
        const dy = y - iy;
        const dz = z - iz;

        let avgX = 0;
        for (let px = -2; px < 4; px++) {
            const f = this.lanczos(dx - px);
            avgX += f;
            this.lanczosX[px + 2] = f;
        }

        let avgY = 0;
        for (let py = -2; py < 4; py++) {
            const f = this.lanczos(dy - py);
            avgY += f;
            this.lanczosY[py + 2] = f;
        }

        let avgZ = 0;
        let n = 0;
        for (let pz = -2; pz < 4; pz++) {
            let avgYZ = 0;
            for (let py = -2; py < 4; py++) {
                let a = 0;
                for (let px = -2; px < 4; px++) {
                    a += this.random(ix + px, iy + py, iz + pz) * this.lanczosX[px + 2];
                }
                a /= avgX;
                avgYZ += a * this.lanczosY[py + 2];
            }
            avgYZ /= avgY;
            const lanczosZ = this.lanczos(dz - pz);
            n += avgYZ * lanczosZ;
            avgZ += lanczosZ;
        }

        return (n / avgZ) * 0.5;
    }

    random(ix, iy, iz) {
        const seed = ix * 374761393 + iy * 668265263 + iz * 73856093 + this.seed * 9301 + 49297;
        return (seed * seed * 58731) % 1;
    }
}


//hardcoded permutations array 
const lookup = new Uint8Array([151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247,
    120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
    88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134,
    139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220,
    105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80,
    73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
    164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38,
    147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189,
    28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101,
    155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
    178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12,
    191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181,
    199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236,
    205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180]);


//much faster than true lanczos
class FastLanczosNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    cubicInterpolate(p0, p1, p2, p3, t) {
        return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
    }

    noise(x, y, z) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);

        const dx = x - ix;
        const dy = y - iy;

        const n00 = this.random(ix - 1, iy - 1);
        const n10 = this.random(ix + 0, iy - 1);
        const n20 = this.random(ix + 1, iy - 1);
        const n30 = this.random(ix + 2, iy - 1);

        const n01 = this.random(ix - 1, iy + 0);
        const n11 = this.random(ix + 0, iy + 0);
        const n21 = this.random(ix + 1, iy + 0);
        const n31 = this.random(ix + 2, iy + 0);

        const n02 = this.random(ix - 1, iy + 1);
        const n12 = this.random(ix + 0, iy + 1);
        const n22 = this.random(ix + 1, iy + 1);
        const n32 = this.random(ix + 2, iy + 1);

        const n03 = this.random(ix - 1, iy + 2);
        const n13 = this.random(ix + 0, iy + 2);
        const n23 = this.random(ix + 1, iy + 2);
        const n33 = this.random(ix + 2, iy + 2);

        const col0 = this.cubicInterpolate(n00, n10, n20, n30, dx);
        const col1 = this.cubicInterpolate(n01, n11, n21, n31, dx);
        const col2 = this.cubicInterpolate(n02, n12, n22, n32, dx);
        const col3 = this.cubicInterpolate(n03, n13, n23, n33, dx);

        let result = this.cubicInterpolate(col0, col1, col2, col3, dy);

        return result;
    }
}

class FastLanczosNoise3D extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    cubicInterpolate(p0, p1, p2, p3, t) {
        return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
    }

    noise(x, y, z) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iz = Math.floor(z);

        const dx = x - ix;
        const dy = y - iy;
        const dz = z - iz;

        const n000 = this.random(ix - 1, iy - 1, iz - 1);
        const n100 = this.random(ix + 0, iy - 1, iz - 1);
        const n200 = this.random(ix + 1, iy - 1, iz - 1);
        const n300 = this.random(ix + 2, iy - 1, iz - 1);

        const n010 = this.random(ix - 1, iy + 0, iz - 1);
        const n110 = this.random(ix + 0, iy + 0, iz - 1);
        const n210 = this.random(ix + 1, iy + 0, iz - 1);
        const n310 = this.random(ix + 2, iy + 0, iz - 1);

        const n020 = this.random(ix - 1, iy + 1, iz - 1);
        const n120 = this.random(ix + 0, iy + 1, iz - 1);
        const n220 = this.random(ix + 1, iy + 1, iz - 1);
        const n320 = this.random(ix + 2, iy + 1, iz - 1);

        const n030 = this.random(ix - 1, iy + 2, iz - 1);
        const n130 = this.random(ix + 0, iy + 2, iz - 1);
        const n230 = this.random(ix + 1, iy + 2, iz - 1);
        const n330 = this.random(ix + 2, iy + 2, iz - 1);

        const n001 = this.random(ix - 1, iy - 1, iz + 0);
        const n101 = this.random(ix + 0, iy - 1, iz + 0);
        const n201 = this.random(ix + 1, iy - 1, iz + 0);
        const n301 = this.random(ix + 2, iy - 1, iz + 0);

        const n011 = this.random(ix - 1, iy + 0, iz + 0);
        const n111 = this.random(ix + 0, iy + 0, iz + 0);
        const n211 = this.random(ix + 1, iy + 0, iz + 0);
        const n311 = this.random(ix + 2, iy + 0, iz + 0);

        const n021 = this.random(ix - 1, iy + 1, iz + 0);
        const n121 = this.random(ix + 0, iy + 1, iz + 0);
        const n221 = this.random(ix + 1, iy + 1, iz + 0);
        const n321 = this.random(ix + 2, iy + 1, iz + 0);

        const n031 = this.random(ix - 1, iy + 2, iz + 0);
        const n131 = this.random(ix + 0, iy + 2, iz + 0);
        const n231 = this.random(ix + 1, iy + 2, iz + 0);
        const n331 = this.random(ix + 2, iy + 2, iz + 0);

        const n002 = this.random(ix - 1, iy - 1, iz + 1);
        const n102 = this.random(ix + 0, iy - 1, iz + 1);
        const n202 = this.random(ix + 1, iy - 1, iz + 1);
        const n302 = this.random(ix + 2, iy - 1, iz + 1);

        const n012 = this.random(ix - 1, iy + 0, iz + 1);
        const n112 = this.random(ix + 0, iy + 0, iz + 1);
        const n212 = this.random(ix + 1, iy + 0, iz + 1);
        const n312 = this.random(ix + 2, iy + 0, iz + 1);

        const n022 = this.random(ix - 1, iy + 1, iz + 1);
        const n122 = this.random(ix + 0, iy + 1, iz + 1);
        const n222 = this.random(ix + 1, iy + 1, iz + 1);
        const n322 = this.random(ix + 2, iy + 1, iz + 1);

        const n032 = this.random(ix - 1, iy + 2, iz + 1);
        const n132 = this.random(ix + 0, iy + 2, iz + 1);
        const n232 = this.random(ix + 1, iy + 2, iz + 1);
        const n332 = this.random(ix + 2, iy + 2, iz + 1);

        const n003 = this.random(ix - 1, iy - 1, iz + 2);
        const n103 = this.random(ix + 0, iy - 1, iz + 2);
        const n203 = this.random(ix + 1, iy - 1, iz + 2);
        const n303 = this.random(ix + 2, iy - 1, iz + 2);

        const n013 = this.random(ix - 1, iy + 0, iz + 2);
        const n113 = this.random(ix + 0, iy + 0, iz + 2);
        const n213 = this.random(ix + 1, iy + 0, iz + 2);
        const n313 = this.random(ix + 2, iy + 0, iz + 2);

        const n023 = this.random(ix - 1, iy + 1, iz + 2);
        const n123 = this.random(ix + 0, iy + 1, iz + 2);
        const n223 = this.random(ix + 1, iy + 1, iz + 2);
        const n323 = this.random(ix + 2, iy + 1, iz + 2);

        const n033 = this.random(ix - 1, iy + 2, iz + 2);
        const n133 = this.random(ix + 0, iy + 2, iz + 2);
        const n233 = this.random(ix + 1, iy + 2, iz + 2);
        const n333 = this.random(ix + 2, iy + 2, iz + 2);

        const col00 = this.cubicInterpolate(n000, n100, n200, n300, dx);
        const col10 = this.cubicInterpolate(n010, n110, n210, n310, dx);
        const col20 = this.cubicInterpolate(n020, n120, n220, n320, dx);
        const col30 = this.cubicInterpolate(n030, n130, n230, n330, dx);

        const col01 = this.cubicInterpolate(n001, n101, n201, n301, dx);
        const col11 = this.cubicInterpolate(n011, n111, n211, n311, dx);
        const col21 = this.cubicInterpolate(n021, n121, n221, n321, dx);
        const col31 = this.cubicInterpolate(n031, n131, n231, n331, dx);

        const col02 = this.cubicInterpolate(n002, n102, n202, n302, dx);
        const col12 = this.cubicInterpolate(n012, n112, n212, n312, dx);
        const col22 = this.cubicInterpolate(n022, n122, n222, n322, dx);
        const col32 = this.cubicInterpolate(n032, n132, n232, n332, dx);

        const col03 = this.cubicInterpolate(n003, n103, n203, n303, dx);
        const col13 = this.cubicInterpolate(n013, n113, n213, n313, dx);
        const col23 = this.cubicInterpolate(n023, n123, n223, n323, dx);
        const col33 = this.cubicInterpolate(n033, n133, n233, n333, dx);

        const row0 = this.cubicInterpolate(col00, col10, col20, col30, dy);
        const row1 = this.cubicInterpolate(col01, col11, col21, col31, dy);
        const row2 = this.cubicInterpolate(col02, col12, col22, col32, dy);
        const row3 = this.cubicInterpolate(col03, col13, col23, col33, dy);

        let result = this.cubicInterpolate(row0, row1, row2, row3, dz);
        return result;
    }

}


class VoronoiNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255)]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        let minDist = Infinity;
        let minVal = 0;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const xi = Math.floor(x) + i;
                const yi = Math.floor(y) + j;

                const px = xi + this.random(xi, yi);
                const py = yi + this.random(yi, xi);

                const dist = (px - x) * (px - x) + (py - y) * (py - y);

                if (dist < minDist) {
                    minDist = dist;
                    minVal = this.random(xi, yi);
                }

            }
        }

        return minVal;
    }
}

class VoronoiNoise3D extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        let minDist = Infinity;
        let minVal = 0;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);

                    if (dist < minDist) {
                        minDist = dist;
                        minVal = this.random(xi, yi, zi);
                    }
                }
            }
        }

        return minVal;
    }
}




class CellularNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255)]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        let minDist1 = Infinity;
        let minDist2 = Infinity;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const xi = Math.floor(x) + i;
                const yi = Math.floor(y) + j;

                const px = xi + this.random(xi, yi);
                const py = yi + this.random(yi, xi);

                const dist = (px - x) * (px - x) + (py - y) * (py - y);

                if (dist < minDist1) {
                    minDist2 = minDist1;
                    minDist1 = dist;
                } else if (dist < minDist2) {
                    minDist2 = dist;
                }
            }
        }

        return minDist2 - minDist1;
    }
}


class CellularNoise3D extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        let minDist1 = Infinity;
        let minDist2 = Infinity;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);

                    if (dist < minDist1) {
                        minDist2 = minDist1;
                        minDist1 = dist;
                    } else if (dist < minDist2) {
                        minDist2 = dist;
                    }
                }
            }
        }

        return minDist2 - minDist1;
    }
}

class WorleyNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255)]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        let minDist = Infinity;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const xi = Math.floor(x) + i;
                const yi = Math.floor(y) + j;

                const px = xi + this.random(xi, yi);
                const py = yi + this.random(yi, xi);

                const dist = (px - x) * (px - x) + (py - y) * (py - y);

                if (dist < minDist) {
                    minDist = dist;
                }
            }
        }

        return Math.sqrt(minDist);
    }
}

class WorleyNoise3D extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        let minDist = Infinity;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);

                    if (dist < minDist) {
                        minDist = dist;
                    }
                }
            }
        }

        return Math.sqrt(minDist);
    }
}


//The next 3 are essentially identical
class HermiteNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    hermiteInterpolate(a, b, t) {
        const f = t * t * (3 - 2 * t);
        return a * (1 - f) + b * f;
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iz = Math.floor(z);

        const dx = x - ix;
        const dy = y - iy;
        const dz = z - iz;

        const n000 = this.random(ix, iy, iz);
        const n100 = this.random(ix + 1, iy, iz);
        const n010 = this.random(ix, iy + 1, iz);
        const n110 = this.random(ix + 1, iy + 1, iz);
        const n001 = this.random(ix, iy, iz + 1);
        const n101 = this.random(ix + 1, iy, iz + 1);
        const n011 = this.random(ix, iy + 1, iz + 1);
        const n111 = this.random(ix + 1, iy + 1, iz + 1);

        const nx00 = this.hermiteInterpolate(n000, n100, dx);
        const nx10 = this.hermiteInterpolate(n010, n110, dx);
        const nx01 = this.hermiteInterpolate(n001, n101, dx);
        const nx11 = this.hermiteInterpolate(n011, n111, dx);

        const nxy0 = this.hermiteInterpolate(nx00, nx10, dy);
        const nxy1 = this.hermiteInterpolate(nx01, nx11, dy);

        return this.hermiteInterpolate(nxy0, nxy1, dz);
    }
}

class QuinticNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    quinticInterpolate(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iz = Math.floor(z);

        const dx = x - ix;
        const dy = y - iy;
        const dz = z - iz;

        const n000 = this.random(ix, iy, iz);
        const n100 = this.random(ix + 1, iy, iz);
        const n010 = this.random(ix, iy + 1, iz);
        const n110 = this.random(ix + 1, iy + 1, iz);
        const n001 = this.random(ix, iy, iz + 1);
        const n101 = this.random(ix + 1, iy, iz + 1);
        const n011 = this.random(ix, iy + 1, iz + 1);
        const n111 = this.random(ix + 1, iy + 1, iz + 1);

        const u = this.quinticInterpolate(dx);
        const v = this.quinticInterpolate(dy);
        const w = this.quinticInterpolate(dz);

        const nx00 = n000 * (1 - u) + n100 * u;
        const nx10 = n010 * (1 - u) + n110 * u;
        const nx01 = n001 * (1 - u) + n101 * u;
        const nx11 = n011 * (1 - u) + n111 * u;

        const nxy0 = nx00 * (1 - v) + nx10 * v;
        const nxy1 = nx01 * (1 - v) + nx11 * v;

        return nxy0 * (1 - w) + nxy1 * w;
    }
}

class CosineNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    cosineInterpolate(a, b, t) {
        const t2 = (1 - Math.cos(t * Math.PI)) / 2;
        return a * (1 - t2) + b * t2;
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    noise(x, y, z) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iz = Math.floor(z);

        const dx = x - ix;
        const dy = y - iy;
        const dz = z - iz;

        const n000 = this.random(ix, iy, iz);
        const n100 = this.random(ix + 1, iy, iz);
        const n010 = this.random(ix, iy + 1, iz);
        const n110 = this.random(ix + 1, iy + 1, iz);
        const n001 = this.random(ix, iy, iz + 1);
        const n101 = this.random(ix + 1, iy, iz + 1);
        const n011 = this.random(ix, iy + 1, iz + 1);
        const n111 = this.random(ix + 1, iy + 1, iz + 1);

        const nx00 = this.cosineInterpolate(n000, n100, dx);
        const nx10 = this.cosineInterpolate(n010, n110, dx);
        const nx01 = this.cosineInterpolate(n001, n101, dx);
        const nx11 = this.cosineInterpolate(n011, n111, dx);

        const nxy0 = this.cosineInterpolate(nx00, nx10, dy);
        const nxy1 = this.cosineInterpolate(nx01, nx11, dy);

        return this.cosineInterpolate(nxy0, nxy1, dz);
    }
}


//now for generator implementations, just extend them with the previous noise generators

class PerlinNoise extends Noise {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) { noiseValue = Math.abs(noiseValue); } //this just makes the billow effect
            sum += noiseValue;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        if (turbulence) sum -= 1;
        return sum;
    }
}


class Cellular extends CellularNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) { noiseValue = Math.abs(noiseValue); } //this just makes the billow effect
            sum += noiseValue;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        if (turbulence) sum -= 1;
        return 2*sum-1;
    }
}


class Worley extends WorleyNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) { noiseValue = Math.abs(noiseValue); } //this just makes the billow effect
            sum += noiseValue;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        if (turbulence) sum -= 1;
        return sum-1;
    }
}


class Hermite extends HermiteNoise {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) { noiseValue = Math.abs(noiseValue); } //this just makes the billow effect
            sum += noiseValue;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        if (turbulence) sum -= 1;
        return sum-1;
    }
}



class Quintic extends QuinticNoise {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) { noiseValue = Math.abs(noiseValue); } //this just makes the billow effect
            sum += noiseValue;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        if (turbulence) sum -= 1;
        return sum-1;
    }
}



class Cosine extends CosineNoise {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) { noiseValue = Math.abs(noiseValue); } //this just makes the billow effect
            sum += noiseValue;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        if (turbulence) sum -= 1;
        return sum-1;
    }
}


class HexWorms extends CellularNoise {
    noise(x, y = 0, z = 0) {
        const steps = 5;
        const persistence = 0.5;

        let total = 0;
        let frequency = 1;
        let amplitude = 1;

        for (let i = 0; i < steps; i++) {
            const angle = super.noise(x * frequency, y * frequency, z * frequency) * Math.PI * 2;
            const nx = x + Math.cos(angle) * 0.5;
            const ny = y + Math.sin(angle) * 0.5;
            const nz = z + Math.sin(angle) * 0.5;
            total += super.noise(nx, ny, nz) * amplitude;

            amplitude *= persistence;
            frequency *= 2;
        }

        total -= 1;

        return total;
    }

    generateNoise(x, y = 0, z = 0, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        for (let i = 0; i < octaves; i++) {
            sum += this.noise(x * freq, y * freq, z * freq) * amp;
            freq *= lacunarity;
            amp *= gain;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        return sum;
    }
}

class PerlinWorms extends Noise {
    noise(x, y = 0, z = 0) {
        const steps = 5;
        const persistence = 0.5;

        let total = 0;
        let frequency = 1;
        let amplitude = 1;

        for (let i = 0; i < steps; i++) {
            const angle = super.noise(x * frequency, y * frequency, z * frequency) * Math.PI * 2;
            const nx = x + Math.cos(angle) * 0.5;
            const ny = y + Math.sin(angle) * 0.5;
            const nz = z + Math.sin(angle) * 0.5;
            total += super.noise(nx, ny, nz) * amplitude;

            amplitude *= persistence;
            frequency *= 2;
        }

        return total;
    }

    generateNoise(x, y = 0, z = 0, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        for (let i = 0; i < octaves; i++) {
            sum += this.noise(x * freq, y * freq, z * freq) * amp;
            freq *= lacunarity;
            amp *= gain;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        return sum;
    }
}

class LanczosBillowNoise extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let maxAmp = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; // start at random angle for X rotation
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            const noiseValue = this.noise(x * freq, y * freq, z * freq);
            sum += (2 * Math.abs(noiseValue) - 1) * amp;

            maxAmp += amp;
            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates around the Z axis
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);
            let newX = x * cosAngle - y * sinAngle;
            let newY = x * sinAngle + y * cosAngle;
            let newZ = z;

            let rotatedX = newX * cosAngle + newZ * sinAngle;
            let rotatedZ = -newX * sinAngle + newZ * cosAngle;
            newX = rotatedX;
            newZ = rotatedZ;

            let rotatedY = newY * cosAngle - newZ * sinAngle;
            rotatedZ = newY * sinAngle + newZ * cosAngle;
            newY = rotatedY;
            newZ = rotatedZ;

            x = newX;
            y = newY;
            z = newZ;

            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        sum /= maxAmp;

        return sum;
    }
}

class LanczosAntiBillowNoise extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0; 
        let maxAmp = 0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            const noiseValue = this.noise(x * freq, y * freq, z * freq);
            sum += (2 * Math.abs(noiseValue) - 1) * amp;

            maxAmp += amp;
            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        sum /= maxAmp;

        return -sum;
    }
}

class BillowNoise extends Noise {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            const noiseValue = this.noise(x * freq, y * freq, z * freq);
            sum += (2 * Math.abs(noiseValue) - 1) * amp;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        sum += 1;

        return sum;
    }
}

class AntiBillowNoise extends Noise {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        const angleIncrement = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            const noiseValue = this.noise(x * freq, y * freq, z * freq);
            sum += (2 * Math.abs(noiseValue) - 1) * amp;

            freq *= lacunarity;
            amp *= gain;

            // Apply rotation to the coordinates
            const cosAngle = Math.cos(angle);
            const sinAngle = Math.sin(angle);

            const newX = x * cosAngle - y * sinAngle;
            const newY = x * sinAngle + y * cosAngle;
            const newZ = y * sinAngle + z * cosAngle;

            x = newX;
            y = newY;
            z = newZ;
            angle += angleIncrement;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        sum += 1;

        return -sum;
    }
}

class RidgeNoise extends Noise {
    noise(x, y, z) {
        let value = super.noise(x, y, z);
        value = 1 - Math.abs(value);
        return value * value;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        for (let i = 0; i < octaves; i++) {
            sum += this.noise(x * freq, y * freq, z * freq) * amp;
            freq *= lacunarity;
            amp *= gain;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        sum -= 1;

        return -sum;
    }
}

class AntiRidgeNoise extends Noise {
    noise(x, y, z) {
        let value = super.noise(x, y, z);
        value = 1 - Math.abs(value);
        return value * value;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;
        for (let i = 0; i < octaves; i++) {
            sum += this.noise(x * freq, y * freq, z * freq) * amp;
            freq *= lacunarity;
            amp *= gain;

            // Apply shift to the coordinates
            x += xShift;
            y += yShift;
            z += zShift;
        }

        sum -= 1;
        return sum;
    }
}

class RidgedMultifractalNoise extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 8, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, exp1 = 1, exp2 = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 1 - Math.abs(this.noise(x, y, z));
        let amp = 1.0;

        for (let i = 1; i < octaves; i++) {
            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;

            amp *= gain;

            let noise = Math.abs(this.noise(x, y, z));
            if (exp2) noise = 1 - Math.pow(noise, exp2);
            if (exp1) noise = Math.pow(noise, exp1);

            sum -= noise * amp;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return sum;
    }
}

class RidgedMultifractalNoise2 extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.75, xShift = 0, yShift = 0, zShift = 0, exp1 = 1, exp2 = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 1 - Math.abs(this.noise(x, y, z));
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        let angleIncr = Math.PI / 4;
        for (let i = 1; i < octaves; i++) {
            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;

            amp *= gain;

            let noise = Math.abs(this.noise(x, y, z));
            if (exp2) noise = 1 - Math.pow(noise, exp2);
            if (exp1) noise = Math.pow(noise, exp1);

            sum -= noise * amp;

            x = x * Math.cos(angle) + x * Math.sin(angle);
            y = y * Math.sin(angle) + y * Math.cos(angle);
            z = z * Math.sin(angle) + z * Math.cos(angle);
            angle += angleIncr;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return sum;
    }
}

class RidgedMultifractalNoise3 extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 8, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, exp1 = 0, exp2 = 1.5) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        for (let i = 0; i < octaves; i++) {
            let noise = this.noise(x, y, z);

            noise = Math.max(0.0000001, (noise + 1));

            noise = 2 * Math.pow(noise * 0.5, exp2) - 1;

            noise = 1 - Math.abs(noise);

            if (exp1) noise = 1 - (Math.pow(noise, exp1));

            sum += noise * amp;

            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;

            amp *= gain;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return (sum - 1);
    }
}

class RidgedMultifractalNoise4 extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 8, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, exp1 = 1, exp2 = 0.5) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        for (let i = 0; i < octaves; i++) {
            let noise = Math.abs(this.noise(x, y, z));
            if (exp2) noise = 1 - Math.pow(noise, exp2);
            if (exp1) noise = Math.pow(noise, exp1);

            sum += noise * amp;

            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;
            amp *= gain;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return sum - 1;
    }
}

class RidgedAntiMultifractalNoise extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 8, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, exp1 = 1, exp2 = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 1 - Math.abs(this.noise(x, y, z));
        let amp = 1.0;

        for (let i = 1; i < octaves; i++) {
            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;

            amp *= gain;

            let noise = Math.abs(this.noise(x, y, z));
            if (exp2) noise = 1 - Math.pow(noise, exp2);
            if (exp1) noise = Math.pow(noise, exp1);

            sum -= noise * amp;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return -sum;
    }
}

class RidgedAntiMultifractalNoise2 extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, exp1 = 1, exp2 = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 1 - Math.abs(this.noise(x, y, z));
        let amp = 1.0;

        let angle = this.seedN * 2 * Math.PI; //start at random angle;
        let angleIncr = Math.PI / 4;
        for (let i = 1; i < octaves; i++) {
            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;

            amp *= gain;

            let noise = Math.abs(this.noise(x, y, z));
            if (exp2) noise = 1 - Math.pow(noise, exp2);
            if (exp1) noise = Math.pow(noise, exp1);

            sum -= noise * amp;

            x = x * Math.cos(angle) + x * Math.sin(angle);
            y = y * Math.sin(angle) + y * Math.cos(angle);
            z = z * Math.sin(angle) + z * Math.cos(angle);
            angle += angleIncr;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return -sum;
    }
}

class RidgedAntiMultifractalNoise3 extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 8, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, exp1 = 0, exp2 = 1.5) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        for (let i = 0; i < octaves; i++) {
            let noise = this.noise(x, y, z);

            noise = Math.max(0.0000001, (noise + 1));

            noise = 2 * Math.pow(noise * 0.5, exp2) - 1;

            noise = 1 - Math.abs(noise);

            if (exp1) noise = 1 - (Math.pow(noise, exp1));

            sum += noise * amp;

            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;

            amp *= gain;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return -(sum - 1);
    }
}

class RidgedAntiMultifractalNoise4 extends FastLanczosNoise3D {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 8, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, exp1 = 1, exp2 = 0.5) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;

        for (let i = 0; i < octaves; i++) {
            let noise = Math.abs(this.noise(x, y, z));
            if (exp2) noise = 1 - Math.pow(noise, exp2);
            if (exp1) noise = Math.pow(noise, exp1);

            sum += noise * amp;

            x *= lacunarity;
            y *= lacunarity;
            z *= lacunarity;
            amp *= gain;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return -(sum - 1);
    }
}

class FractalBrownianMotion extends SimplexNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum / maxValue;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(fbm1, fbm1, fbm1, 1, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 2 * fbm2;
    }
}

class FractalBrownianMotion2 extends SimplexNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum / maxValue;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(fbm1 * zoom, fbm1 * zoom, fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm3 = this.fbm(x + fbm2 * zoom, y + fbm2 * zoom, z + fbm2 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 2 * fbm3;
    }
}

class FractalBrownianMotion3 extends SimplexNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum / maxValue;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(x + fbm1 * zoom, y + fbm1 * zoom, z + fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm3 = this.fbm(x + fbm2 * zoom, y + fbm2 * zoom, z + fbm2 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 2 * fbm3;
    }
}

class CellularBrownianMotion extends CellularNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(fbm1 * zoom, fbm1 * zoom, fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 1.5 * fbm2 - 1;
    }
}

class CellularBrownianMotion2 extends CellularNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(fbm1 * zoom, fbm1 * zoom, fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm3 = this.fbm(x + fbm2 * zoom, y + fbm2 * zoom, z + fbm2 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 1.5 * fbm3 - 1;
    }
}

class CellularBrownianMotion3 extends CellularNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(x + fbm1 * zoom, y + fbm1 * zoom, z + fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm3 = this.fbm(x + fbm2 * zoom, y + fbm2 * zoom, z + fbm2 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 1.5 * fbm3 - 1;
    }
}

class VoronoiBrownianMotion extends VoronoiNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum - 1;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(fbm1 * zoom, fbm1 * zoom, fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return fbm2;
    }
}

class VoronoiBrownianMotion2 extends VoronoiNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum - 1;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(fbm1 * zoom, fbm1 * zoom, fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm3 = this.fbm(x + fbm2 * zoom, y + fbm2 * zoom, z + fbm2 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return fbm3;
    }
}

class VoronoiBrownianMotion3 extends VoronoiNoise3D {
    fbm(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amplitude = 1.0;
        let maxValue = 0;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            sum += amplitude * this.noise(x * freq, y * freq, z * freq);
            maxValue += amplitude;

            freq *= lacunarity;
            amplitude *= gain;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return sum - 1;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.fbm(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.fbm(x + fbm1 * zoom, y + fbm1 * zoom, z + fbm1 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm3 = this.fbm(x + fbm2 * zoom, y + fbm2 * zoom, z + fbm2 * zoom, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return fbm3;
    }
}

class VoronoiTileNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    euclideanDist(px, py, pz, x, y, z) {
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    noise(x, y, z, edgeThreshold) {
        let minDist = Infinity;
        let secondMinDist = Infinity;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = this.euclideanDist(px, py, pz, x, y, z);

                    if (dist < minDist) {
                        secondMinDist = minDist;
                        minDist = dist;
                    } else if (dist < secondMinDist) {
                        secondMinDist = dist;
                    }
                }
            }
        }

        const edgeDist = secondMinDist - minDist;
        const edgeGradient = edgeDist < edgeThreshold ? 0 : 1;
        const combinedGradient = edgeDist * edgeGradient;

        return combinedGradient;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, edgeThreshold = 0.05) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let total = 0;
        let amplitude = 1;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * freq, y * freq, z * freq, edgeThreshold) * amplitude;

            amplitude *= gain;
            freq *= lacunarity;

            x += xShift;
            y += yShift;
            z += zShift;
        }
        return 2 * total - 1;
    }
}

class VoronoiCircleGradientTileNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    euclideanDist(px, py, pz, x, y, z) {
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    noise(x, y, z, edgeThreshold) {
        let minDist = Infinity;
        let secondMinDist = Infinity;
        let minVal = 0;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = this.euclideanDist(px, py, pz, x, y, z);

                    if (dist < minDist) {
                        secondMinDist = minDist;
                        minDist = dist;
                        minVal = this.random(xi, yi, zi);
                    } else if (dist < secondMinDist) {
                        secondMinDist = dist;
                    }
                }
            }
        }

        const edgeDist = secondMinDist - minDist;
        const centerGradient = 1 - Math.min(minDist, 1);
        const edgeGradient = edgeDist < edgeThreshold ? 0 : 1;
        const combinedGradient = centerGradient * edgeGradient;

        return combinedGradient;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, edgeThreshold = 0.05) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let total = 0;
        let amplitude = 1;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * freq, y * freq, z * freq, edgeThreshold) * amplitude;

            amplitude *= gain;
            freq *= lacunarity;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return total - 1;
    }
}

class VoronoiCircleGradientTileNoise2 extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    euclideanDist(px, py, pz, x, y, z) {
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    noise(x, y, z) {
        let minDist = Infinity;
        let minVal = 0;
        let closestPoint = { px: 0, py: 0, pz: 0 };

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = this.euclideanDist(px, py, pz, x, y, z);

                    if (dist < minDist) {
                        minDist = dist;
                        minVal = this.random(xi, yi, zi);
                        closestPoint = { px, py, pz };
                    }
                }
            }
        }

        const centerDist = Math.sqrt(
            (closestPoint.px - x) * (closestPoint.px - x) +
            (closestPoint.py - y) * (closestPoint.py - y) +
            (closestPoint.pz - z) * (closestPoint.pz - z)
        );

        const gradient = Math.sin(centerDist * Math.PI);

        return minVal * gradient;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let total = 0;
        let maxValue = 0;
        let amplitude = 1;

        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * freq / zoom, y * freq / zoom, z * freq / zoom) * amplitude;

            maxValue += amplitude;
            amplitude *= gain;
            freq *= lacunarity;

            angle += Math.PI * 2 / octaves; 
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return total - 1;
    }
}

class VoronoiFlatShadeTileNoise extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    euclideanDist(px, py, pz, x, y, z) {
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    noise(x, y, z, edgeThreshold) {
        let minDist = Infinity;
        let secondMinDist = Infinity;
        let minVal = 0;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = this.euclideanDist(px, py, pz, x, y, z);

                    if (dist < minDist) {
                        secondMinDist = minDist;
                        minDist = dist;
                        minVal = this.random(xi, yi, zi);
                    } else if (dist < secondMinDist) {
                        secondMinDist = dist;
                    }
                }
            }
        }

        const edgeDist = secondMinDist - minDist;
        const edgeGradient = edgeDist < edgeThreshold ? 0 : 1;
        const combinedGradient = edgeGradient;

        return combinedGradient;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, edgeThreshold = 0.05) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let total = 0;
        let amplitude = 1;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * freq, y * freq, z * freq, edgeThreshold) * amplitude;

            amplitude *= gain;
            freq *= lacunarity;

            x += xShift;
            y += yShift;
            z += zShift;
        }

        return total - 1;
    }
}

class VoronoiRipple3D extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    euclideanDist(px, py, pz, x, y, z) {
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    noise(x, y, z, t = 0, rippleFreq = 10, zoom = 1) {
        let minDist = Infinity;
        let secondMinDist = Infinity;
        let minVal = 0;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = this.euclideanDist(px, py, pz, x, y, z);

                    if (dist < minDist) {
                        secondMinDist = minDist;
                        minDist = dist;
                        minVal = this.random(xi, yi, zi);
                    } else if (dist < secondMinDist) {
                        secondMinDist = dist;
                    }
                }
            }
        }

        const edgeDist = secondMinDist - minDist;
        const rippleEffect = Math.sin(Math.PI + edgeDist * Math.PI * rippleFreq + t);

        return minVal * (1 + rippleEffect) * 0.5;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, rt = 0, rippleFreq = 10) {
        let total = 0;
        let maxValue = 0;
        let amplitude = 1;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * freq / zoom, y * freq / zoom, z * freq / zoom, rt, rippleFreq) * amplitude;

            maxValue += amplitude;
            amplitude *= gain;
            freq *= lacunarity;

            const angle = this.seedN * 2 * Math.PI;
            const offsetX = xShift * Math.cos(angle + i);
            const offsetY = yShift * Math.sin(angle + i);
            const offsetZ = zShift * Math.sin(angle + i);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return 2 * total - 1;
    }
}

class VoronoiRipple3D2 extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    euclideanDist(px, py, pz, x, y, z) {
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    noise(x, y, z, t = 0, rippleFreq = 10, zoom = 1) {
        let minDist = Infinity;
        let secondMinDist = Infinity;
        let minVal = 0;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = this.euclideanDist(px, py, pz, x, y, z);

                    if (dist < minDist) {
                        secondMinDist = minDist;
                        minDist = dist;
                        minVal = this.random(xi, yi, zi);
                    } else if (dist < secondMinDist) {
                        secondMinDist = dist;
                    }
                }
            }
        }

        const edgeDist = secondMinDist - minDist;
        const rippleEffect = Math.sin(Math.PI + zoom * edgeDist * Math.PI * rippleFreq + t);

        return minVal * (1 + rippleEffect) * 0.5;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, rt = 0, rippleFreq = 10) {
        let total = 0;
        let maxValue = 0;
        let amplitude = 1;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * freq / zoom, y * freq / zoom, z * freq / zoom, rt, rippleFreq, zoom) * amplitude;

            maxValue += amplitude;
            amplitude *= gain;
            freq *= lacunarity;

            const angle = this.seedN * 2 * Math.PI;
            const offsetX = xShift * Math.cos(angle + i);
            const offsetY = yShift * Math.sin(angle + i);
            const offsetZ = zShift * Math.sin(angle + i);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return 2 * total - 1;
    }
}

class VoronoiCircularRipple3D extends BaseNoise {
    constructor(seed = Date.now()) {
        super(seed);
    }

    random(x, y, z) {
        const idx = (this.perm[(x & 255) + this.perm[(y & 255) + this.perm[z & 255]]]) & 255;
        return this.perm[idx] / 255;
    }

    euclideanDist(px, py, pz, x, y, z) {
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    noise(x, y, z, t = 0, rippleFrequency = 10) {
        let minDist = Infinity;
        let minVal = 0;

        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const xi = Math.floor(x) + i;
                    const yi = Math.floor(y) + j;
                    const zi = Math.floor(z) + k;

                    const px = xi + this.random(xi, yi, zi);
                    const py = yi + this.random(yi, zi, xi);
                    const pz = zi + this.random(zi, xi, yi);

                    const dist = this.euclideanDist(px, py, pz, x, y, z);

                    if (dist < minDist) {
                        minDist = dist;
                        minVal = this.random(xi, yi, zi);
                    }
                }
            }
        }

        const rippleEffect = Math.sin(Math.PI + minDist * Math.PI * rippleFrequency + t);

        return minVal * (1 + rippleEffect) * 0.5;
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, t = 0, rippleFreq = 10) {
        let total = 0;
        let amplitude = 1;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * freq / zoom, y * freq / zoom, z * freq / zoom, t, rippleFreq) * amplitude;

            amplitude *= gain;
            freq *= lacunarity;

            const angle = this.seedN * 2 * Math.PI;
            const offsetX = xShift * Math.cos(angle + i);
            const offsetY = yShift * Math.sin(angle + i);
            const offsetZ = zShift * Math.sin(angle + i);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        return 2 * total - 1;
    }
}

class FVoronoiRipple3D extends VoronoiRipple3D {
    constructor(seed = Date.now()) {
        super(seed);
        this.gen = new VoronoiRipple3D(seed);
    }

    generateNoise = (x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) => {
        let fbm1 = this.gen.generateNoise(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.gen.generateNoise(fbm1, fbm1, fbm1, 1, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 2 * fbm2;
    }
}

class FVoronoiCircularRipple3D extends VoronoiCircularRipple3D {
    constructor(seed = Date.now()) {
        super(seed);
        this.gen = new VoronoiCircularRipple3D(seed);
    }

    generateNoise = (x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) => {
        let fbm1 = this.gen.generateNoise(x, y, z, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.gen.generateNoise(fbm1, fbm1, fbm1, 1, freq, octaves, lacunarity, gain, xShift, yShift, zShift);

        return 2 * fbm2;
    }
}

class RippleNoise extends FastLanczosNoise {
    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false, rippleFrequency = 12, neighborhoodSize = 1) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;
        let totalAmp = 0;
        let angle = this.seedN * 2 * Math.PI;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) {
                noiseValue = Math.abs(noiseValue);
            }

            const ripple = this.calculateRippleEffect(x * freq, y * freq, z * freq, rippleFrequency / zoom, neighborhoodSize);
            noiseValue *= ripple;

            sum += noiseValue;
            totalAmp += amp;

            freq *= lacunarity;
            amp *= gain;

            angle += Math.PI * 2 / octaves;
            let offsetX = xShift * Math.cos(angle + Math.random() * Math.PI);
            let offsetY = yShift * Math.sin(angle + Math.random() * Math.PI);
            let offsetZ = zShift * Math.sin(angle + Math.random() * Math.PI);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        if (turbulence) {
            sum -= 1;
        }
        return octaves * sum;
    }

    calculateRippleEffect(x, y, z, rippleFrequency, neighborhoodSize) {
        const staticPoints = this.getStaticRipplePoints(x, y, z, neighborhoodSize);

        let rippleSum = 0;
        for (const point of staticPoints) {
            const distance = Math.sqrt(
                (point[0] - x) * (point[0] - x) +
                (point[1] - y) * (point[1] - y) +
                (point[2] - z) * (point[2] - z)
            );
            rippleSum += Math.sin(distance * Math.PI * rippleFrequency);
        }

        return rippleSum / staticPoints.length;
    }

    getStaticRipplePoints(x, y, z, neighborhoodSize) {
        const points = [];

        for (let dx = -neighborhoodSize; dx <= neighborhoodSize; dx++) {
            for (let dy = -neighborhoodSize; dy <= neighborhoodSize; dy++) {
                for (let dz = -neighborhoodSize; dz <= neighborhoodSize; dz++) {
                    const px = this.continuousPermutation(x + dx);
                    const py = this.continuousPermutation(y + dy);
                    const pz = this.continuousPermutation(z + dz);
                    points.push([px, py, pz]);
                }
            }
        }

        return points;
    }

    continuousPermutation(value) {
        const perm = this.perm;
        const intPart = Math.floor(value);
        const fracPart = value - intPart;

        const index1 = (intPart % 256 + 256) % 256;
        const index2 = ((intPart + 1) % 256 + 256) % 256;

        const permValue1 = perm[index1];
        const permValue2 = perm[index2];

        return permValue1 + fracPart * (permValue2 - permValue1);
    }
}

class FractalRipples extends FastLanczosNoise {
    gen(x, y, z, zoom = 1.0, freq = 1, octaves = 6, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0, turbulence = false, rippleFrequency = 4, neighborhoodSize = 1) {
        x /= zoom;
        y /= zoom;
        z /= zoom;

        let sum = 0;
        let amp = 1.0;
        let totalAmp = 0;
        let angle = this.seedN * 2 * Math.PI;
        const incr = Math.PI / 4;

        for (let i = 0; i < octaves; i++) {
            let noiseValue = this.noise(x * freq, y * freq, z * freq) * amp;
            if (turbulence) {
                noiseValue = Math.abs(noiseValue);
            }

            const ripple = this.calculateRippleEffect(x * freq, y * freq, z * freq, rippleFrequency, neighborhoodSize);
            noiseValue *= ripple;

            sum += noiseValue;
            totalAmp += amp;

            freq *= lacunarity;
            amp *= gain;

            angle += Math.PI / 4;
            let offsetX = xShift * Math.cos(angle);
            let offsetY = yShift * Math.sin(angle);
            let offsetZ = zShift * Math.sin(angle);

            x += offsetX;
            y += offsetY;
            z += offsetZ;
        }

        if (turbulence) {
            sum -= 1;
        }
        return octaves * sum;
    }

    calculateRippleEffect(x, y, z, rippleFrequency, neighborhoodSize) {
        const staticPoints = this.getStaticRipplePoints(x, y, z, neighborhoodSize);
        let rippleSum = 0;
        const twoPiRippleFreq = 2 * Math.PI * rippleFrequency;

        for (const point of staticPoints) {
            const dx = point[0] - x;
            const dy = point[1] - y;
            const dz = point[2] - z;
            const distance = dx * dx + dy * dy + dz * dz;
            rippleSum += Math.sin(Math.sqrt(distance) * twoPiRippleFreq);
        }

        return rippleSum / staticPoints.length;
    }

    getStaticRipplePoints(x, y, z, neighborhoodSize) {
        const points = [];
        for (let dx = -neighborhoodSize; dx <= neighborhoodSize; dx++) {
            for (let dy = -neighborhoodSize; dy <= neighborhoodSize; dy++) {
                for (let dz = -neighborhoodSize; dz <= neighborhoodSize; dz++) {
                    points.push([
                        this.continuousPermutation(x + dx),
                        this.continuousPermutation(y + dy),
                        this.continuousPermutation(z + dz)
                    ]);
                }
            }
        }
        return points;
    }

    continuousPermutation(value) {
        const perm = this.perm;
        const intPart = Math.floor(value);
        const fracPart = value - intPart;
        const index1 = (intPart % 256 + 256) % 256;
        const index2 = ((intPart + 1) % 256 + 256) % 256;
        return perm[index1] + fracPart * (perm[index2] - perm[index1]);
    }

    generateNoise(x, y, z, zoom = 1.0, freq = 1, octaves = 4, lacunarity = 2.0, gain = 0.5, xShift = 0, yShift = 0, zShift = 0) {
        let fbm1 = this.gen(x, y, z, 1000 * zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        let fbm2 = this.gen(fbm1, fbm1, fbm1, zoom, freq, octaves, lacunarity, gain, xShift, yShift, zShift);
        return 2 * fbm2;
    }
}



//noise functions
export {
    //noise base classes (have the noise(x,y,z) function)
    BaseNoise, //the base class with some shared utilities for replicable seeding/permutations

    //has noise(x,y,z) functions
    Noise,
    SimplexNoise,
    SimplexNoise3D,
    LanczosNoise,
    FastLanczosNoise,
    FastLanczosNoise3D,
    VoronoiNoise,
    VoronoiNoise3D,
    CellularNoise,
    CellularNoise3D,
    WorleyNoise,
    WorleyNoise3D,
    CosineNoise,
    HermiteNoise,
    QuinticNoise,

    //extensions (has the generateNoise() functions with nearly identical inputs)
    PerlinNoise,

    Hermite,
    Quintic,
    Cosine,
    
    BillowNoise,
    AntiBillowNoise,
    LanczosBillowNoise,
    LanczosAntiBillowNoise,

    RidgeNoise,
    AntiRidgeNoise,

    RidgedMultifractalNoise,
    RidgedMultifractalNoise2,
    RidgedMultifractalNoise3,
    RidgedMultifractalNoise4,

    RidgedAntiMultifractalNoise,
    RidgedAntiMultifractalNoise2,
    RidgedAntiMultifractalNoise3,
    RidgedAntiMultifractalNoise4,

    FractalBrownianMotion,
    FractalBrownianMotion2,
    FractalBrownianMotion3,

    PerlinWorms,
    HexWorms,

    Cellular,
    Worley,

    CellularBrownianMotion,
    CellularBrownianMotion2,
    CellularBrownianMotion3,

    VoronoiBrownianMotion,
    VoronoiBrownianMotion2,
    VoronoiBrownianMotion3,

    VoronoiTileNoise,
    VoronoiFlatShadeTileNoise,
    VoronoiRipple3D,
    VoronoiRipple3D2,
    VoronoiCircularRipple3D,
    VoronoiCircleGradientTileNoise,
    VoronoiCircleGradientTileNoise2,
    FVoronoiRipple3D,
    FVoronoiCircularRipple3D,
    
    RippleNoise,
    FractalRipples

}



