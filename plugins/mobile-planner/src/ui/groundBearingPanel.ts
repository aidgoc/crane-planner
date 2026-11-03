// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type AllPadsGroundBearingResult,
    evaluateGroundBearingVerdict,
    type PadReactionsResult,
    PLANNING_DISCLAIMER,
} from "../modules/outriggers";
import style from "./groundBearingPanel.module.css";

export interface GroundBearingPanelOptions {
    readonly defaultPadAreaM2?: number;
    readonly defaultAllowableT_M2?: number;
    readonly onVerdictChange?: (verdict: AllPadsGroundBearingResult) => void;
}

export interface GroundBearingPanelController {
    readonly element: HTMLElement;
    update(reactions: PadReactionsResult): AllPadsGroundBearingResult;
    getLatestVerdict(): AllPadsGroundBearingResult | undefined;
    getPadAreaM2(): number;
    getAllowableBearingCapacityT_M2(): number | undefined;
}

export function createGroundBearingPanel(
    options: GroundBearingPanelOptions = {},
): GroundBearingPanelController {
    const defaultPadArea = options.defaultPadAreaM2 ?? 1.0;
    const defaultAllowable = options.defaultAllowableT_M2 ?? 25.0;

    const panel = document.createElement("div");
    panel.className = style.panel;

    const title = document.createElement("div");
    title.className = style.title;
    title.textContent = "Ground Bearing & Outrigger Stability";
    panel.appendChild(title);

    // Input fields
    const inputsRow = document.createElement("div");
    inputsRow.className = style.inputsRow;

    const areaGroup = document.createElement("div");
    areaGroup.className = style.inputGroup;
    const areaLabel = document.createElement("label");
    areaLabel.className = style.label;
    areaLabel.textContent = "Pad Area (m²)";
    const areaInput = document.createElement("input");
    areaInput.type = "number";
    areaInput.min = "0.1";
    areaInput.step = "0.1";
    areaInput.value = String(defaultPadArea);
    areaInput.className = style.inputField;
    areaGroup.appendChild(areaLabel);
    areaGroup.appendChild(areaInput);

    const allowableGroup = document.createElement("div");
    allowableGroup.className = style.inputGroup;
    const allowableLabel = document.createElement("label");
    allowableLabel.className = style.label;
    allowableLabel.textContent = "Allowable Soil (t/m²)";
    const allowableInput = document.createElement("input");
    allowableInput.type = "number";
    allowableInput.min = "1";
    allowableInput.step = "1";
    allowableInput.value = String(defaultAllowable);
    allowableInput.className = style.inputField;
    allowableGroup.appendChild(allowableLabel);
    allowableGroup.appendChild(allowableInput);

    inputsRow.appendChild(areaGroup);
    inputsRow.appendChild(allowableGroup);
    panel.appendChild(inputsRow);

    // Verdict Banner
    const verdictBanner = document.createElement("div");
    verdictBanner.className = `${style.verdictBanner} ${style.verdictNotChecked}`;
    verdictBanner.textContent = "Awaiting crane calculation...";
    panel.appendChild(verdictBanner);

    // 4 Pads Grid
    const padsGrid = document.createElement("div");
    padsGrid.className = style.padsGrid;

    const padCards: Record<
        string,
        { card: HTMLElement; reaction: HTMLElement; pressure: HTMLElement; badge: HTMLElement }
    > = {};
    const padDefinitions = [
        { id: "frontLeft", name: "Front-Left (FL)" },
        { id: "frontRight", name: "Front-Right (FR)" },
        { id: "rearLeft", name: "Rear-Left (RL)" },
        { id: "rearRight", name: "Rear-Right (RR)" },
    ];

    for (const def of padDefinitions) {
        const card = document.createElement("div");
        card.className = style.padCard;

        const header = document.createElement("div");
        header.className = style.padHeader;
        const name = document.createElement("span");
        name.className = style.padTitle;
        name.textContent = def.name;
        const badge = document.createElement("span");
        badge.className = style.badgeNotChecked;
        badge.textContent = "—";
        header.appendChild(name);
        header.appendChild(badge);

        const reaction = document.createElement("div");
        reaction.className = style.padReaction;
        reaction.textContent = "0.00 t";

        const pressure = document.createElement("div");
        pressure.className = style.padPressure;
        pressure.textContent = "0.00 t/m² (0.0 kPa)";

        card.appendChild(header);
        card.appendChild(reaction);
        card.appendChild(pressure);
        padsGrid.appendChild(card);

        padCards[def.id] = { card, reaction, pressure, badge };
    }

    panel.appendChild(padsGrid);

    // Disclaimer
    const disclaimer = document.createElement("div");
    disclaimer.className = style.disclaimer;
    disclaimer.textContent = PLANNING_DISCLAIMER;
    panel.appendChild(disclaimer);

    let latestReactions: PadReactionsResult | undefined;
    let latestVerdict: AllPadsGroundBearingResult | undefined;

    function getPadArea(): number {
        const val = parseFloat(areaInput.value);
        return Number.isFinite(val) && val > 0 ? val : defaultPadArea;
    }

    function getAllowable(): number | undefined {
        const val = parseFloat(allowableInput.value);
        return Number.isFinite(val) && val > 0 ? val : undefined;
    }

    function recalculate(): AllPadsGroundBearingResult | undefined {
        if (!latestReactions) {
            return undefined;
        }
        const area = getPadArea();
        const allowable = getAllowable();
        const verdictRes = evaluateGroundBearingVerdict(latestReactions, area, allowable);
        latestVerdict = verdictRes;

        // Update Pad Cards
        const p = verdictRes.pads;
        const updates: Array<{
            id: string;
            reaction: number;
            pressureM2: number;
            pressureKPa: number;
            status: string;
        }> = [
            {
                id: "frontLeft",
                reaction: p.frontLeft.reactionT,
                pressureM2: p.frontLeft.pressureT_M2,
                pressureKPa: p.frontLeft.pressureKPa,
                status: p.frontLeft.status,
            },
            {
                id: "frontRight",
                reaction: p.frontRight.reactionT,
                pressureM2: p.frontRight.pressureT_M2,
                pressureKPa: p.frontRight.pressureKPa,
                status: p.frontRight.status,
            },
            {
                id: "rearLeft",
                reaction: p.rearLeft.reactionT,
                pressureM2: p.rearLeft.pressureT_M2,
                pressureKPa: p.rearLeft.pressureKPa,
                status: p.rearLeft.status,
            },
            {
                id: "rearRight",
                reaction: p.rearRight.reactionT,
                pressureM2: p.rearRight.pressureT_M2,
                pressureKPa: p.rearRight.pressureKPa,
                status: p.rearRight.status,
            },
        ];

        for (const u of updates) {
            const dom = padCards[u.id];
            dom.reaction.textContent = `${u.reaction.toFixed(2)} t`;
            dom.pressure.textContent = `${u.pressureM2.toFixed(2)} t/m² (${u.pressureKPa.toFixed(1)} kPa)`;
            dom.badge.textContent = u.status;
            dom.badge.className =
                u.status === "PASS"
                    ? style.badgePass
                    : u.status === "FAIL"
                      ? style.badgeFail
                      : style.badgeNotChecked;
        }

        // Update Banner
        verdictBanner.textContent = verdictRes.verdict;
        verdictBanner.className = `${style.verdictBanner} ${
            verdictRes.status === "PASS"
                ? style.verdictPass
                : verdictRes.status === "FAIL"
                  ? style.verdictFail
                  : style.verdictNotChecked
        }`;

        options.onVerdictChange?.(verdictRes);
        return verdictRes;
    }

    areaInput.addEventListener("input", () => recalculate());
    allowableInput.addEventListener("input", () => recalculate());

    return {
        element: panel,
        update(reactions: PadReactionsResult): AllPadsGroundBearingResult {
            latestReactions = reactions;
            const res = recalculate();
            if (!res) {
                throw new Error("Unable to evaluate ground bearing verdict");
            }
            return res;
        },
        getLatestVerdict(): AllPadsGroundBearingResult | undefined {
            return latestVerdict;
        },
        getPadAreaM2(): number {
            return getPadArea();
        },
        getAllowableBearingCapacityT_M2(): number | undefined {
            return getAllowable();
        },
    };
}
