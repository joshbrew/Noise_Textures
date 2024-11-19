class PseudoRandom {
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }

    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return this.seed;
    }

    random() {
        return (this.next() - 1) / 2147483646;
    }
}

const EPSILON = Math.pow(2, -52);
const EDGE_STACK = new Uint32Array(512);

function orient2d(ax, ay, bx, by, cx, cy) {
    const acx = ax - cx;
    const acy = ay - cy;
    const bcx = bx - cx;
    const bcy = by - cy;
    return acy * bcx - acx * bcy;
}

function pseudoAngle(dx, dy) {
    const absSum = Math.abs(dx) + Math.abs(dy);
    if (absSum === 0) return 0; // Avoid division by zero
    const p = dx / absSum;
    return (dy > 0 ? 3 - p : 1 + p) / 4; // [0..1]
}

function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

function inCircle(ax, ay, bx, by, cx, cy, px, py) {
    const dx = ax - px;
    const dy = ay - py;
    const ex = bx - px;
    const ey = by - py;
    const fx = cx - px;
    const fy = cy - py;

    const ap = dx * dx + dy * dy;
    const bp = ex * ex + ey * ey;
    const cp = fx * fx + fy * fy;

    const cross1 = ey * cp - bp * fy;
    const cross2 = ex * cp - bp * fx;
    const cross3 = ex * fy - ey * fx;

    return dx * cross1 - dy * cross2 + ap * cross3 < 0;
}

function circumradius(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax;
    const dy = by - ay;
    const ex = cx - ax;
    const ey = cy - ay;

    const bl = dx * dx + dy * dy;
    const cl = ex * ex + ey * ey;
    const determinant = dx * ey - dy * ex;

    if (determinant === 0) return Infinity; // Avoid division by zero
    const factor = 0.5 / determinant;

    const x = (ey * bl - dy * cl) * factor;
    const y = (dx * cl - ex * bl) * factor;

    return x * x + y * y;
}

function circumcenter(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax;
    const dy = by - ay;
    const ex = cx - ax;
    const ey = cy - ay;

    const bl = dx * dx + dy * dy;
    const cl = ex * ex + ey * ey;
    const determinant = dx * ey - dy * ex;

    if (determinant === 0) return null; // Degenerate case
    const factor = 0.5 / determinant;

    const x = ax + (ey * bl - dy * cl) * factor;
    const y = ay + (dx * cl - ex * bl) * factor;

    return { x, y };
}

function quicksort(ids, dists, left, right) {
    // Insertion sort for small partitions
    if (right - left <= 20) {
        for (let i = left + 1; i <= right; i++) {
            const temp = ids[i];
            const tempDist = dists[temp];
            let j = i - 1;
            while (j >= left && dists[ids[j]] > tempDist) {
                ids[j + 1] = ids[j];
                j--;
            }
            ids[j + 1] = temp;
        }
        return;
    }

    // Median-of-three pivot selection
    const median = (left + right) >> 1;
    if (dists[ids[left]] > dists[ids[right]]) swap(ids, left, right);
    if (dists[ids[left]] > dists[ids[median]]) swap(ids, left, median);
    if (dists[ids[median]] > dists[ids[right]]) swap(ids, median, right);

    // Partitioning
    let pivotIndex = median;
    const pivot = ids[pivotIndex];
    const pivotDist = dists[pivot];
    swap(ids, pivotIndex, right); // Move pivot to the end
    let partitionIndex = left;

    for (let i = left; i < right; i++) {
        if (dists[ids[i]] < pivotDist) {
            swap(ids, i, partitionIndex);
            partitionIndex++;
        }
    }
    swap(ids, partitionIndex, right); // Move pivot to its final place

    // Recursive calls for smaller partitions first
    const leftSize = partitionIndex - left;
    const rightSize = right - partitionIndex;
    if (leftSize < rightSize) {
        quicksort(ids, dists, left, partitionIndex - 1);
        quicksort(ids, dists, partitionIndex + 1, right);
    } else {
        quicksort(ids, dists, partitionIndex + 1, right);
        quicksort(ids, dists, left, partitionIndex - 1);
    }
}

function swap(arr, i, j) {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

function defaultGetX(p) {
    return p[0];
}
function defaultGetY(p) {
    return p[1];
}

export default class Delaunator {

    static from(points, getX = defaultGetX, getY = defaultGetY) {
        const n = points.length;
        const coords = new Float64Array(n * 2);

        for (let i = 0; i < n; i++) {
            const p = points[i];
            coords[2 * i] = getX(p);
            coords[2 * i + 1] = getY(p);
        }

        return new Delaunator(coords);
    }

    constructor(coords) {
        const n = coords.length >> 1;
        if (n > 0 && typeof coords[0] !== 'number') throw new Error('Expected coords to contain numbers.');

        this.coords = coords;

        // arrays that will store the triangulation graph
        const maxTriangles = Math.max(2 * n - 5, 0);
        this._triangles = new Uint32Array(maxTriangles * 3);
        this._halfedges = new Int32Array(maxTriangles * 3);

        // temporary arrays for tracking the edges of the advancing convex hull
        this._hashSize = Math.ceil(Math.sqrt(n));
        this._hullPrev = new Uint32Array(n); // edge to prev edge
        this._hullNext = new Uint32Array(n); // edge to next edge
        this._hullTri = new Uint32Array(n); // edge to adjacent triangle
        this._hullHash = new Int32Array(this._hashSize); // angular edge hash

        // temporary arrays for sorting points
        this._ids = new Uint32Array(n);
        this._dists = new Float64Array(n);

        this.update();
    }

    update() {
        const {
            coords,
            _hullPrev: hullPrev,
            _hullNext: hullNext,
            _hullTri: hullTri,
            _hullHash: hullHash
        } = this;
        const n = coords.length >> 1;
    
        // Populate an array of point indices; calculate input data bbox
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
        for (let i = 0; i < n; i++) {
            const x = coords[2 * i];
            const y = coords[2 * i + 1];
            
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            
            this._ids[i] = i;
        }
    
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
    
        let i0, i1, i2;
    
        // Pick a seed point close to the center
        for (let i = 0, minDist = Infinity; i < n; i++) {
            const d = dist(cx, cy, coords[2 * i], coords[2 * i + 1]);
            if (d < minDist) {
                i0 = i;
                minDist = d;
            }
        }
    
        const i0x = coords[2 * i0];
        const i0y = coords[2 * i0 + 1];
    
        // Find the point closest to the seed
        for (let i = 0, minDist = Infinity; i < n; i++) {
            if (i === i0) continue;
            const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
            if (d < minDist && d > 0) {
                i1 = i;
                minDist = d;
            }
        }
    
        let i1x = coords[2 * i1];
        let i1y = coords[2 * i1 + 1];
    
        let minRadius = Infinity;
    
        // Find the third point which forms the smallest circumcircle with the first two
        for (let i = 0; i < n; i++) {
            if (i === i0 || i === i1) continue;
            const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
            if (r < minRadius) {
                i2 = i;
                minRadius = r;
            }
        }
    
        let i2x = coords[2 * i2];
        let i2y = coords[2 * i2 + 1];
    
        if (minRadius === Infinity) {
            // Order collinear points by dx (or dy if all x are identical) and return the list as a hull
            for (let i = 0; i < n; i++) {
                this._dists[i] = (coords[2 * i] - coords[0]) || (coords[2 * i + 1] - coords[1]);
            }
            quicksort(this._ids, this._dists, 0, n - 1);
            const hull = new Uint32Array(n);
            let j = 0;
            for (let i = 0, d0 = -Infinity; i < n; i++) {
                const id = this._ids[i];
                const d = this._dists[id];
                if (d > d0) {
                    hull[j++] = id;
                    d0 = d;
                }
            }
            this.hull = hull.subarray(0, j);
            this.triangles = new Uint32Array(0);
            this.halfedges = new Uint32Array(0);
            return;
        }
    
        // Swap the order of the seed points for counter-clockwise orientation
        if (orient2d(i0x, i0y, i1x, i1y, i2x, i2y) < 0) {
            [i1, i2] = [i2, i1];
            [i1x, i2x] = [i2x, i1x];
            [i1y, i2y] = [i2y, i1y];
        }
    
        const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
        this._cx = center.x;
        this._cy = center.y;
    
        for (let i = 0; i < n; i++) {
            this._dists[i] = dist(coords[2 * i], coords[2 * i + 1], center.x, center.y);
        }
    
        // Sort the points by distance from the seed triangle circumcenter
        quicksort(this._ids, this._dists, 0, n - 1);
    
        // Set up the seed triangle as the starting hull
        this._hullStart = i0;
        let hullSize = 3;
    
        hullNext[i0] = hullPrev[i2] = i1;
        hullNext[i1] = hullPrev[i0] = i2;
        hullNext[i2] = hullPrev[i1] = i0;
    
        hullTri[i0] = 0;
        hullTri[i1] = 1;
        hullTri[i2] = 2;
    
        hullHash.fill(-1);
        hullHash[this._hashKey(i0x, i0y)] = i0;
        hullHash[this._hashKey(i1x, i1y)] = i1;
        hullHash[this._hashKey(i2x, i2y)] = i2;
    
        this.trianglesLen = 0;
        this._addTriangle(i0, i1, i2, -1, -1, -1);
    
        let xp, yp;
        for (let k = 0; k < this._ids.length; k++) {
            const i = this._ids[k];
            const x = coords[2 * i];
            const y = coords[2 * i + 1];
    
            // Skip near-duplicate points
            if (k > 0 && Math.abs(x - xp) <= EPSILON && Math.abs(y - yp) <= EPSILON) continue;
            xp = x;
            yp = y;
    
            // Skip seed triangle points
            if (i === i0 || i === i1 || i === i2) continue;
    
            // Find a visible edge on the convex hull using edge hash
            let start = 0;
            for (let j = 0, key = this._hashKey(x, y); j < this._hashSize; j++) {
                start = hullHash[(key + j) % this._hashSize];
                if (start !== -1 && start !== hullNext[start]) break;
            }
    
            start = hullPrev[start];
            let e = start, q;
            while ((q = hullNext[e]), orient2d(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1]) >= 0) {
                e = q;
                if (e === start) {
                    e = -1;
                    break;
                }
            }
            if (e === -1) continue; // Likely a near-duplicate point; skip it
    
            // Add the first triangle from the point
            let t = this._addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]);
    
            // Recursively flip triangles from the point until they satisfy the Delaunay condition
            hullTri[i] = this._legalize(t + 2);
            hullTri[e] = t; // Keep track of boundary triangles on the hull
            hullSize++;
    
            // Walk forward through the hull, adding more triangles and flipping recursively
            let n = hullNext[e];
            while ((q = hullNext[n]), orient2d(x, y, coords[2 * n], coords[2 * n + 1], coords[2 * q], coords[2 * q + 1]) < 0) {
                t = this._addTriangle(n, i, q, hullTri[i], -1, hullTri[n]);
                hullTri[i] = this._legalize(t + 2);
                hullNext[n] = n; // Mark as removed
                hullSize--;
                n = q;
            }
    
            // Walk backward from the other side, adding more triangles and flipping
            if (e === start) {
                while ((q = hullPrev[e]), orient2d(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1]) < 0) {
                    t = this._addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);
                    this._legalize(t + 2);
                    hullTri[q] = t;
                    hullNext[e] = e; // Mark as removed
                    hullSize--;
                    e = q;
                }
            }
    
            // Update the hull indices
            this._hullStart = hullPrev[i] = e;
            hullNext[e] = hullPrev[n] = i;
            hullNext[i] = n;
    
            // Save the two new edges in the hash table
            hullHash[this._hashKey(x, y)] = i;
            hullHash[this._hashKey(coords[2 * e], coords[2 * e + 1])] = e;
        }
    
        // Construct the final hull
        this.hull = new Uint32Array(hullSize);
        for (let i = 0, e = this._hullStart; i < hullSize; i++) {
            this.hull[i] = e;
            e = hullNext[e];
        }
    
        // Trim typed triangle mesh arrays
        this.triangles = this._triangles.subarray(0, this.trianglesLen);
        this.halfedges = this._halfedges.subarray(0, this.trianglesLen);
    }

    _hashKey(x, y) {
        return Math.floor(pseudoAngle(x - this._cx, y - this._cy) * this._hashSize) % this._hashSize;
    }

    _legalize(a) {
        const { _triangles: triangles, _halfedges: halfedges, coords } = this;

        let i = 0;
        let ar = 0;

        // recursion eliminated with a fixed-size stack
        while (true) {
            const b = halfedges[a];

            if (b === -1) { // convex hull edge
                if (i === 0) break;
                a = EDGE_STACK[--i];
                continue;
            }

            const a0 = a - a % 3;
            ar = a0 + (a + 2) % 3;

            const b0 = b - b % 3;
            const al = a0 + (a + 1) % 3;
            const bl = b0 + (b + 2) % 3;

            const p0 = triangles[ar];
            const pr = triangles[a];
            const pl = triangles[al];
            const p1 = triangles[bl];

            const illegal = inCircle(
                coords[2 * p0], coords[2 * p0 + 1],
                coords[2 * pr], coords[2 * pr + 1],
                coords[2 * pl], coords[2 * pl + 1],
                coords[2 * p1], coords[2 * p1 + 1]);

            if (illegal) {
                triangles[a] = p1;
                triangles[b] = p0;

                const hbl = halfedges[bl];

                // edge swapped on the other side of the hull (rare); fix the halfedge reference
                if (hbl === -1) {
                    let e = this._hullStart;
                    do {
                        if (this._hullTri[e] === bl) {
                            this._hullTri[e] = a;
                            break;
                        }
                        e = this._hullPrev[e];
                    } while (e !== this._hullStart);
                }
                this._link(a, hbl);
                this._link(b, halfedges[ar]);
                this._link(ar, bl);

                const br = b0 + (b + 1) % 3;

                // don't worry about hitting the cap: it can only happen on extremely degenerate input
                if (i < EDGE_STACK.length) {
                    EDGE_STACK[i++] = br;
                }
            } else {
                if (i === 0) break;
                a = EDGE_STACK[--i];
            }
        }

        return ar;
    }

    _link(a, b) {
        this._halfedges[a] = b;
        if (b !== -1) this._halfedges[b] = a;
    }

    // add a new triangle given vertex indices and adjacent half-edge ids
    _addTriangle(i0, i1, i2, a, b, c) {
        const t = this.trianglesLen;

        this._triangles[t] = i0;
        this._triangles[t + 1] = i1;
        this._triangles[t + 2] = i2;

        this._link(t, a);
        this._link(t + 1, b);
        this._link(t + 2, c);

        this.trianglesLen += 3;

        return t;
    }

}