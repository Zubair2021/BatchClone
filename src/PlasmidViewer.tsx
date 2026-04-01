import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Plasmid } from "./types";
import LegendPanel from "./plasmid-viewer/LegendPanel";
import PlasmidMap from "./plasmid-viewer/PlasmidMap";
import FeatureTooltip from "./plasmid-viewer/FeatureTooltip";
import { formatSequence } from "./plasmid-viewer/utils";

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
  const [collapseMinorAnnotations, setCollapseMinorAnnotations] = useState(false);
  const [labelFontSize, setLabelFontSize] = useState(11);
  const [labelSpacing, setLabelSpacing] = useState(1.1);
  const [zoom, setZoom] = useState(0.34);
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
  const hoveredFeature = activePlasmid?.features.find((feature) => feature.id === hoveredFeatureId) ?? null;

  if (!activePlasmid) {
    return <div className="empty-map">Load a sequence to view it.</div>;
  }

  const plasmidData = activePlasmid;
  const mapFeatures = plasmidData.features.filter((feature) => visibleIds.has(feature.id));

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
    handleVisibleChange(mode === "all" ? plasmidData.features.map((feature) => feature.id) : []);
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
    link.download = `${sanitizeFileName(plasmidData.name)}-map.svg`;
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
        <div className="sequence-pane">
          <div className="sequence-header">
            <strong>{sequenceLabel ?? plasmidData.name}</strong>
            <span>{(activeSequenceText ?? plasmidData.sequence).length.toLocaleString()} bp</span>
          </div>
          <pre>{formatSequence(activeSequenceText ?? plasmidData.sequence)}</pre>
        </div>
      ) : (
        <div className={`pv-layout${legendVisible ? "" : " full-width"}`}>
          <section className="pv-map-panel">
            <div className="pv-map-frame">
              {tab === "map" ? (
                <div className="pv-map-actions">
                  <label className="pv-check compact">
                    <input type="checkbox" checked={collapseMinorAnnotations} onChange={(event) => setCollapseMinorAnnotations(event.target.checked)} />
                    Minor
                  </label>
                  <label className="pv-inline-range compact">
                    Label size
                    <input type="range" min="9" max="16" step="1" value={labelFontSize} onChange={(event) => setLabelFontSize(Number(event.target.value))} />
                  </label>
                  <label className="pv-inline-range compact">
                    Label spacing
                    <input type="range" min="0.8" max="2" step="0.1" value={labelSpacing} onChange={(event) => setLabelSpacing(Number(event.target.value))} />
                  </label>
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
                collapseMinorAnnotations={collapseMinorAnnotations}
                labelFontSize={labelFontSize}
                labelSpacing={labelSpacing}
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
              <label className="pv-inline-range">
                Zoom
                <input type="range" min="0.08" max="1.2" step="0.02" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              </label>
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
