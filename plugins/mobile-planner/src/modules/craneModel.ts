// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export type CranePointM = {
    xM: number;
    yM: number;
};

export type ChartCell = {
    readonly boomLengthM: number;
    readonly radiusM: number;
    readonly capacityT: number;
};

const boomLengthsM = [13.3, 23.6, 38, 52.4, 70] as const;
const radiiM = [5, 8, 10, 12, 15, 20, 30] as const;
const capacityT = [
    [121, 84.5, 64.5, null, null, null, null],
    [111, 83.5, 68, 57, 45, 27, null],
    [59, 58.5, 53, 47.5, 40, 30.5, 17.2],
    [null, null, 31, 31, 28.5, 23.5, 15],
    [null, null, null, 14.5, 14.5, 14.5, 12.1],
] as const;

const chart = boomLengthsM.flatMap((boomLength, boomIndex) =>
    radiiM.flatMap((radius, radiusIndex) => {
        const capacity = capacityT[boomIndex][radiusIndex];
        return capacity === null ? [] : [{ boomLengthM: boomLength, radiusM: radius, capacityT: capacity }];
    }),
) satisfies readonly ChartCell[];

export const KIT = Object.freeze({
    name: "Grove GMK5250L-1",
    PIVOT_OFFSET_M: 0.8,
    chart,
    source: Object.freeze({
        document: "Grove GMK5250L-1 load chart, official manufacturer download",
        url: "https://www.manitowoc.com/media/15016/download",
        page: 17,
        status: "INDICATIVE",
    }),
});

function assertFinite(value: number, name: string): void {
    if (!Number.isFinite(value)) {
        throw new Error(`${name} must be finite`);
    }
}

export function radiusFromPoint(point: CranePointM): number {
    assertFinite(point.xM, "point.xM");
    assertFinite(point.yM, "point.yM");
    return Math.hypot(point.xM, point.yM) + KIT.PIVOT_OFFSET_M;
}

export function expectedRadiusM(boomLengthM: number, angleDeg: number): number {
    assertFinite(boomLengthM, "boomLengthM");
    assertFinite(angleDeg, "angleDeg");
    return boomLengthM * Math.cos((angleDeg * Math.PI) / 180) + KIT.PIVOT_OFFSET_M;
}

export function capacityAt(boomLengthM: number, radiusM: number): number | null {
    assertFinite(boomLengthM, "boomLengthM");
    assertFinite(radiusM, "radiusM");
    if (boomLengthM < 0 || radiusM < 0) {
        throw new Error("boomLengthM and radiusM must be non-negative");
    }

    if (
        boomLengthM < boomLengthsM[0] ||
        boomLengthM > boomLengthsM[boomLengthsM.length - 1] ||
        radiusM < radiiM[0] ||
        radiusM > radiiM[radiiM.length - 1]
    ) {
        return null;
    }

    const [boomLowIndex, boomHighIndex] = bracket(boomLengthsM, boomLengthM);
    const [radiusLowIndex, radiusHighIndex] = bracket(radiiM, radiusM);
    const corners = [
        capacityT[boomLowIndex][radiusLowIndex],
        capacityT[boomLowIndex][radiusHighIndex],
        capacityT[boomHighIndex][radiusLowIndex],
        capacityT[boomHighIndex][radiusHighIndex],
    ];
    if (corners.some((capacity) => capacity === null)) {
        return null;
    }

    const boomLow = boomLengthsM[boomLowIndex];
    const boomHigh = boomLengthsM[boomHighIndex];
    const radiusLow = radiiM[radiusLowIndex];
    const radiusHigh = radiiM[radiusHighIndex];
    const atRadiusLow = interpolate(
        boomLow,
        boomHigh,
        corners[0] as number,
        corners[2] as number,
        boomLengthM,
    );
    const atRadiusHigh = interpolate(
        boomLow,
        boomHigh,
        corners[1] as number,
        corners[3] as number,
        boomLengthM,
    );
    return interpolate(radiusLow, radiusHigh, atRadiusLow, atRadiusHigh, radiusM);
}

function bracket(values: readonly number[], value: number): [number, number] {
    const exactIndex = values.findIndex((candidate) => Math.abs(value - candidate) < 1e-5);
    if (exactIndex >= 0) {
        return [exactIndex, exactIndex];
    }
    const lowerIndex = values.findIndex((candidate, index) => value > candidate && value < values[index + 1]);
    return [lowerIndex, lowerIndex + 1];
}

function interpolate(
    start: number,
    end: number,
    startValue: number,
    endValue: number,
    value: number,
): number {
    if (start === end) {
        return startValue;
    }
    return startValue + ((value - start) / (end - start)) * (endValue - startValue);
}
