import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Plasmid } from "./types";
import LegendPanel from "./plasmid-viewer/LegendPanel";
import PlasmidMap from "./plasmid-viewer/PlasmidMap";
import FeatureTooltip from "./plasmid-viewer/FeatureTooltip";
import { computeRawSpan, featureContainsPosition, formatSequence, statefulColor } from "./plasmid-viewer/utils";

type ViewerProps = {
  plasmid: Plasmid | null;
  selectedFeatureIds: string[];
  visibleFeatureIds?: string[];
  highlightedSpan?: { start: number; end: number } | null;
  highlightMode?: "region" | "backbone";
  selectionSummary?: string | null;
  sequenceText?: string;
  sequenceLabel?: string;
  onFeatureSelect?: (featureId: string, event: { multi: boolean }) => void;
  onVisibleFeatureIdsChange?: (featureIds: string[]) => void;
  onResetSelection?: () => void;
};

type TabKey = "map" | "sequence";

export default function PlasmidViewer(props: ViewerProps) {
  const {
    plasmid,
    selectedFeatureIds,
    visibleFeatureIds,
    highlightedSpan,
    highlightMode = "region",
    selectionSummary,
    sequenceText,
    sequenceLabel,
    onFeatureSelect,
    onVisibleFeatureIdsChange,
    onResetSelection,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabKey>("map");
  const [labelFontSize, setLabelFontSize] = useState(11);
  const [labelSpacing, setLabelSpacing] = useState(1.1);
  const [zoom, setZoom] = useState(0.34);
  const [originBase, setOriginBase] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [legendVisible, setLegendVisible] = useState(true);
  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ feature: Feature | null; x: number; y: number }>({ feature: null, x: 0, y: 0 });
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(selectedFeatureIds);
  const [internalVisibleIds, setInternalVisibleIds] = useState<string[]>(visibleFeatureIds ?? plasmid?.features.map((feature) => feature.id) ?? []);

  useEffect(() => {
    setInternalSelectedIds(selectedFeatureIds);
  }, [selectedFeatureIds]);

  useEffect(() => {
    setInternalVisibleIds(visibleFeatureIds ?? plasmid?.features.map((feature) => feature.id) ?? []);
  }, [plasmid, visibleFeatureIds]);

  useEffect(() => {
    setOriginBase(0);
    setFlipped(false);
  }, [plasmid?.id]);

  useEffect(() => {
    setZoom(legendVisible ? 0.34 : 0.18);
  }, [legendVisible]);

  const activePlasmid = plasmid;
  const activeSequenceText = sequenceText;
  const controlledSelectedIds = onFeatureSelect ? selectedFeatureIds : internalSelectedIds;
  const selectedIds = useMemo(() => new Set(controlledSelectedIds), [controlledSelectedIds]);
  const visibleArray = onVisibleFeatureIdsChange ? visibleFeatureIds : internalVisibleIds;
  const visibleIds = useMemo(
    () =>
      new Set(
        visibleArray === undefined
          ? activePlasmid?.features.map((feature) => feature.id) ?? []
          : visibleArray,
      ),
    [activePlasmid, visibleArray],
  );
  const plasmidData = activePlasmid;
  const plasmidLengthValue = plasmidData?.length ?? 0;
  const hoveredFeature = plasmidData?.features.find((feature) => feature.id === hoveredFeatureId) ?? null;
  const mapFeatures = plasmidData?.features.filter((feature) => visibleIds.has(feature.id)) ?? [];
  const sequenceValue = activeSequenceText ?? plasmidData?.sequence ?? "";
  const displayedRegion = useMemo(() => {
    if (!plasmidData || !sequenceValue.length || sequenceValue.length >= plasmidLengthValue) {
      return { start: 0, length: sequenceValue.length };
    }
    if (!highlightedSpan) return { start: 0, length: sequenceValue.length };
    if (highlightMode === "backbone") {
      return {
        start: (highlightedSpan.end + 1) % plasmidLengthValue,
        length: sequenceValue.length,
      };
    }
    return {
      start: highlightedSpan.start,
      length: sequenceValue.length,
    };
  }, [highlightMode, highlightedSpan, plasmidLengthValue, sequenceValue.length]);
  const sequenceRows = useMemo(
    () =>
      buildSequenceRows({
        sequence: sequenceValue,
        plasmidLength: plasmidLengthValue,
        features: mapFeatures,
        selectedIds,
        hoveredId: hoveredFeatureId,
        start: displayedRegion.start,
      }),
    [displayedRegion.start, hoveredFeatureId, mapFeatures, plasmidLengthValue, selectedIds, sequenceValue],
  );

  if (!plasmidData) {
    return <div className="empty-map">Load a sequence to view it.</div>;
  }
  const loadedPlasmid = plasmidData;

  function updateTooltip(feature: Feature | null, clientX?: number, clientY?: number) {
    if (!feature || clientX == null || clientY == null) {
      setTooltip((current) => ({ ...current, feature: null }));
      return;
    }

    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;

    setTooltip({
      feature,
      x: clientX - bounds.left + 16,
      y: clientY - bounds.top + 16,
    });
  }

  function handleFeatureHover(feature: Feature | null, event?: React.MouseEvent<HTMLElement | SVGGElement>) {
    setHoveredFeatureId(feature?.id ?? null);
    updateTooltip(feature, event?.clientX, event?.clientY);
  }

  function handleFeatureClick(featureId: string, event: { multi: boolean }) {
    if (!onFeatureSelect) {
      setInternalSelectedIds((current) => {
        const exists = current.includes(featureId);
        if (event.multi) {
          return exists ? current.filter((id) => id !== featureId) : [...current, featureId];
        }
        return exists && current.length === 1 ? [] : [featureId];
      });
      return;
    }
    onFeatureSelect(featureId, event);
  }

  function handleVisibleChange(nextIds: string[]) {
    if (!onVisibleFeatureIdsChange) {
      setInternalVisibleIds(nextIds);
      return;
    }
    onVisibleFeatureIdsChange(nextIds);
  }

  function handleToggleVisibility(featureId: string) {
    const nextIds = visibleIds.has(featureId)
      ? [...visibleIds].filter((id) => id !== featureId)
      : [...visibleIds, featureId];
    handleVisibleChange(nextIds);
  }

  function handleSetVisible(mode: "all" | "none") {
    handleVisibleChange(mode === "all" ? loadedPlasmid.features.map((feature) => feature.id) : []);
  }

  function serializeCurrentMap(): string | null {
    const svg = containerRef.current?.querySelector("svg.pv-map-svg");
    if (!(svg instanceof SVGSVGElement)) return null;
    const clone = svg.cloneNode(true);
    if (!(clone instanceof SVGSVGElement)) return null;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    inlineSvgStyles(svg, clone);
    return new XMLSerializer().serializeToString(clone);
  }

  function sanitizeFileName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "plasmid-map";
  }

  function downloadCurrentMap() {
    const svgMarkup = serializeCurrentMap();
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFileName(loadedPlasmid.name)}-map.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyCurrentMap() {
    const svgMarkup = serializeCurrentMap();
    if (!svgMarkup) return;

    try {
      const pngBlob = await renderSvgToPngBlob(svgMarkup);
      if (pngBlob && "ClipboardItem" in window && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
        return;
      }
      await navigator.clipboard.writeText(svgMarkup);
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = svgMarkup;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      } catch {
        await navigator.clipboard.writeText(svgMarkup);
      }
    }
  }

  function inlineSvgStyles(sourceRoot: SVGSVGElement, targetRoot: SVGSVGElement) {
    const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
    const targetNodes = [targetRoot, ...targetRoot.querySelectorAll("*")];
    const properties = [
      "fill",
      "fill-opacity",
      "stroke",
      "stroke-opacity",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-dasharray",
      "opacity",
      "filter",
      "font",
      "font-family",
      "font-size",
      "font-weight",
      "letter-spacing",
      "text-anchor",
      "dominant-baseline",
      "display",
      "visibility",
    ];

    sourceNodes.forEach((sourceNode, index) => {
      const targetNode = targetNodes[index];
      if (!(sourceNode instanceof Element) || !(targetNode instanceof HTMLElement || targetNode instanceof SVGElement)) return;
      const computed = window.getComputedStyle(sourceNode);
      properties.forEach((property) => {
        const value = computed.getPropertyValue(property);
        if (value) {
          targetNode.style.setProperty(property, value);
        }
      });
    });
  }

  async function renderSvgToPngBlob(svgMarkup: string): Promise<Blob | null> {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error("Failed to load SVG for clipboard copy"));
        nextImage.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.width || 1600;
      canvas.height = image.height || 1600;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="pv-shell" ref={containerRef}>
      <header className="pv-toolbar">
        <div className="pv-toolbar-left">
          <div className="pv-segmented">
            <button type="button" className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Map</button>
            <button type="button" className={tab === "sequence" ? "active" : ""} onClick={() => setTab("sequence")}>Sequence</button>
          </div>
          <div className="pv-context">
            <strong>{plasmidData.name}</strong>
            <span>{plasmidData.length.toLocaleString()} bp</span>
          </div>
        </div>

        <div className="pv-toolbar-right">
          {!legendVisible ? (
            <button type="button" className="pv-ghost-button" onClick={() => setLegendVisible(true)}>
              Show annotations legend
            </button>
          ) : null}
          {tab === "sequence" ? (
            <button type="button" className="pv-ghost-button" onClick={() => setTab("map")}>
              Back to map
            </button>
          ) : null}
        </div>
      </header>

      {tab === "sequence" ? (
        <div className={`pv-layout${legendVisible ? "" : " full-width"}`}>
          <section className="pv-map-panel">
            <div className="sequence-pane annotated">
              <div className="sequence-header">
                <strong>{sequenceLabel ?? plasmidData.name}</strong>
                <span>{sequenceValue.length.toLocaleString()} bp</span>
              </div>
              {sequenceRows.length ? (
                <div className="sequence-lines">
                  {sequenceRows.map((row) => (
                    <div key={`row-${row.start}`} className="sequence-line">
                      <span className="sequence-line-number">{row.start.toLocaleString()}</span>
                      <span className="sequence-line-bases">
                        {row.segments.map((segment, index) => (
                          <span
                            key={`${row.start}-${index}-${segment.featureId ?? "plain"}`}
                            className={`sequence-segment${segment.featureId ? " annotated" : ""}${segment.state ? ` ${segment.state}` : ""}`}
                            style={segment.color ? { color: segment.color } : undefined}
                            title={segment.title}
                          >
                            {segment.text}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <pre>{formatSequence(sequenceValue)}</pre>
              )}
            </div>
          </section>

          {legendVisible ? (
            <LegendPanel
              plasmidLength={plasmidData.length}
              features={plasmidData.features}
              visibleIds={visibleIds}
              selectedIds={selectedIds}
              hoveredId={hoveredFeatureId}
              onFeatureClick={(feature, event) => handleFeatureClick(feature.id, { multi: event.metaKey || event.ctrlKey || event.shiftKey })}
              onFeatureHover={handleFeatureHover}
              onToggleVisibility={handleToggleVisibility}
              onSetVisible={handleSetVisible}
              onToggleLegend={() => setLegendVisible(false)}
            />
          ) : null}
        </div>
      ) : (
        <div className={`pv-layout${legendVisible ? "" : " full-width"}`}>
          <section className="pv-map-panel">
            <div className="pv-map-frame">
              {tab === "map" ? (
                <div className="pv-map-actions">
                  <button type="button" className="pv-ghost-button" onClick={() => void copyCurrentMap()}>
                    Copy
                  </button>
                  <button type="button" className="pv-ghost-button" onClick={downloadCurrentMap}>
                    Export
                  </button>
                  {onResetSelection ? (
                    <button type="button" className="pv-ghost-button" onClick={onResetSelection} disabled={!highlightedSpan && selectedIds.size === 0}>
                      Reset
                    </button>
                  ) : null}
                </div>
              ) : null}
              <PlasmidMap
                plasmidLength={plasmidData.length}
                plasmidName={plasmidData.name}
                strandedness={plasmidData.strandedness}
                features={mapFeatures}
                visibleIds={visibleIds}
                selectedIds={selectedIds}
                hoveredId={hoveredFeatureId}
                labelFontSize={labelFontSize}
                labelSpacing={labelSpacing}
                originBase={originBase}
                flipped={flipped}
                zoom={zoom}
                legendVisible={legendVisible}
                highlightedSpan={highlightedSpan}
                highlightMode={highlightMode}
                onFeatureEnter={(feature, event) => handleFeatureHover(feature, event)}
                onFeatureMove={(feature, event) => handleFeatureHover(feature, event)}
                onFeatureLeave={() => handleFeatureHover(null)}
                onFeatureClick={(feature, event) => handleFeatureClick(feature.id, { multi: event.metaKey || event.ctrlKey || event.shiftKey })}
              />
              <FeatureTooltip feature={tooltip.feature} plasmidLength={plasmidData.length} x={tooltip.x} y={tooltip.y} />
            </div>

            <div className="pv-map-footer">
              <div className="pv-status-block">
                <span className="pv-kicker">Focus</span>
                <strong>{selectionSummary || (selectedIds.size > 0 ? `${selectedIds.size} feature${selectedIds.size === 1 ? "" : "s"}` : "No feature selected")}</strong>
                <p>
                  {hoveredFeature
                    ? `${hoveredFeature.name} · ${hoveredFeature.type}`
                    : selectionSummary
                      ? "Selection is synced from the legend. Adjust boundaries there or reset from the map toolbar."
                      : "Hover a feature or legend row to preview; click to select and sync both panels."}
                </p>
              </div>
              <div className="pv-footer-controls">
                <label className="pv-inline-range compact">
                  Zoom
                  <input type="range" min="0.08" max="1.2" step="0.02" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                </label>
                <label className="pv-inline-range compact">
                  Label size
                  <input type="range" min="9" max="16" step="1" value={labelFontSize} onChange={(event) => setLabelFontSize(Number(event.target.value))} />
                </label>
                <label className="pv-inline-range compact">
                  Label spacing
                  <input type="range" min="0.8" max="2.4" step="0.1" value={labelSpacing} onChange={(event) => setLabelSpacing(Number(event.target.value))} />
                </label>
                <label className="pv-inline-control compact">
                  Origin
                  <input
                    type="number"
                    min={1}
                    max={plasmidData.length}
                    value={originBase + 1}
                    onChange={(event) => setOriginBase(Math.max(0, Math.min(plasmidData.length - 1, Number(event.target.value || 1) - 1)))}
                  />
                </label>
                <label className="pv-check compact">
                  <input type="checkbox" checked={flipped} onChange={(event) => setFlipped(event.target.checked)} />
                  Flip
                </label>
              </div>
            </div>
          </section>

          {legendVisible ? (
            <LegendPanel
              plasmidLength={plasmidData.length}
              features={plasmidData.features}
              visibleIds={visibleIds}
              selectedIds={selectedIds}
              hoveredId={hoveredFeatureId}
              onFeatureClick={(feature, event) => handleFeatureClick(feature.id, { multi: event.metaKey || event.ctrlKey || event.shiftKey })}
              onFeatureHover={handleFeatureHover}
              onToggleVisibility={handleToggleVisibility}
              onSetVisible={handleSetVisible}
              onToggleLegend={() => setLegendVisible(false)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function buildSequenceRows(args: {
  sequence: string;
  plasmidLength: number;
  features: Feature[];
  selectedIds: Set<string>;
  hoveredId: string | null;
  start: number;
}) {
  const { sequence, plasmidLength, features, selectedIds, hoveredId, start } = args;
  const rows: Array<{
    start: number;
    segments: Array<{
      text: string;
      color: string | null;
      featureId: string | null;
      state: string | null;
      title: string;
    }>;
  }> = [];

  for (let offset = 0; offset < sequence.length; offset += 60) {
    const line = sequence.slice(offset, offset + 60);
    const segments: Array<{
      text: string;
      color: string | null;
      featureId: string | null;
      state: string | null;
      title: string;
    }> = [];
    let current = {
      text: "",
      color: null as string | null,
      featureId: null as string | null,
      state: null as string | null,
      title: "",
    };

    for (let index = 0; index < line.length; index += 1) {
      const base = line[index] ?? "";
      const sourcePosition = plasmidLength > 0 ? (start + offset + index) % plasmidLength : index;
      const feature = resolveSequenceFeature(features, sourcePosition, plasmidLength, selectedIds, hoveredId);
      const nextColor = feature ? statefulColor(feature.feature.color, feature.state) : null;
      const nextFeatureId = feature?.feature.id ?? null;
      const nextState = feature?.state ?? null;
      const nextTitle = feature
        ? `${feature.feature.name} · ${feature.feature.type} · ${feature.feature.start + 1}-${feature.feature.end + 1}`
        : "Unannotated sequence";

      if (current.text && current.featureId === nextFeatureId && current.state === nextState) {
        current.text += base;
        continue;
      }

      if (current.text) segments.push(current);
      current = {
        text: base,
        color: nextColor,
        featureId: nextFeatureId,
        state: nextState,
        title: nextTitle,
      };
    }

    if (current.text) segments.push(current);
    rows.push({
      start: offset + 1,
      segments,
    });
  }

  return rows;
}

function resolveSequenceFeature(
  features: Feature[],
  position: number,
  plasmidLength: number,
  selectedIds: Set<string>,
  hoveredId: string | null,
) {
  const covering = features.filter((feature) => featureContainsPosition(feature, position, plasmidLength));
  if (!covering.length) return null;

  const prioritized = [...covering].sort((a, b) => {
    const aSelected = selectedIds.has(a.id) || hoveredId === a.id ? 1 : 0;
    const bSelected = selectedIds.has(b.id) || hoveredId === b.id ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;
    return computeRawSpan(a, plasmidLength) - computeRawSpan(b, plasmidLength);
  })[0];

  if (!prioritized) return null;
  let state: "selected" | "hovered" | "muted" | "default" = "default";
  if (selectedIds.has(prioritized.id)) state = "selected";
  else if (hoveredId === prioritized.id) state = "hovered";
  else if (selectedIds.size > 0) state = "muted";

  return { feature: prioritized, state };
}
