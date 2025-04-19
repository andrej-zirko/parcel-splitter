import React, { useState, useRef, MouseEvent, useEffect, useCallback } from 'react';
import './App.css';

// Define types
type PixelCoord = { x: number; y: number };
type Bounds = { x: number; y: number; width: number; height: number } | null; // Re-purpose for polygon bounds
type SplitDirection = 'vertical' | 'horizontal'; // New type for split direction

// --- Helper Functions ---

// Calculate polygon area using Shoelace formula
const calculatePolygonArea = (vertices: PixelCoord[]): number => {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area / 2);
};

// Check if point is inside polygon using ray casting algorithm
const isPointInPolygon = (point: PixelCoord, polygon: PixelCoord[]): boolean => {
  console.log("isPointInPolygon: Checking point", point, "against polygon", polygon); // Log input
  let isInside = false;
  if (polygon.length < 3) {
      console.log("isPointInPolygon: Polygon has less than 3 points.");
      return false; // Cannot be inside if polygon is not valid
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    // Check for horizontal line segment to avoid division by zero
    if (yj === yi) {
        // If point.y is the same as the horizontal line's y, check if point.x is between xi and xj
        if (point.y === yi && point.x >= Math.min(xi, xj) && point.x <= Math.max(xi, xj)) {
            console.log(`isPointInPolygon: Point lies on horizontal edge ${i}-${j}. Considered inside (or on boundary).`);
            return true; // Point is on the boundary, consider it inside for simplicity here
        }
        // Otherwise, a horizontal line cannot intersect the ray cast horizontally from the point
        continue; // Skip to next segment
    }

    const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

    if (intersect) {
        isInside = !isInside;
    }
  }
  console.log(`isPointInPolygon: Final result: ${isInside}`); // Log final result
  return isInside;
};

// Calculate the bounding box of a polygon
const getPolygonBounds = (polygon: PixelCoord[]): Bounds => {
    if (polygon.length === 0) return null;
    let minX = polygon[0].x, minY = polygon[0].y, maxX = polygon[0].x, maxY = polygon[0].y;
    for (let i = 1; i < polygon.length; i++) {
        if (polygon[i].x < minX) minX = polygon[i].x;
        if (polygon[i].x > maxX) maxX = polygon[i].x;
        if (polygon[i].y < minY) minY = polygon[i].y;
        if (polygon[i].y > maxY) maxY = polygon[i].y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};


function App() {
  const [initialSqM, setInitialSqM] = useState<number>(1264); // ~10000 sq ft in sq m
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [splitNaturalX, setSplitNaturalX] = useState<number | null>(null); // Vertical split line X coord (natural)
  const [splitNaturalY, setSplitNaturalY] = useState<number | null>(null); // Horizontal split line Y coord (natural)
  const [splitDirection, setSplitDirection] = useState<SplitDirection>('vertical'); // Split direction
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<PixelCoord[]>([]); // User-defined vertices
  const [isDefiningPolygon, setIsDefiningPolygon] = useState<boolean>(false); // Mode flag
  const [definedPolygonAreaPixels, setDefinedPolygonAreaPixels] = useState<number | null>(null); // Area in pixels^2
  const [polygonBounds, setPolygonBounds] = useState<Bounds>(null); // Bounds of the defined polygon

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // Canvas/SVG ref can be added here if needed for drawing

  // --- Mode Control Handlers ---
  const handleStartDefining = () => {
    setIsDefiningPolygon(true);
    setPolygonPoints([]); // Reset points when starting
    setSplitNaturalX(null);
    setSplitNaturalY(null);
    setDefinedPolygonAreaPixels(null);
    setPolygonBounds(null);
  };

  const handleFinishDefining = () => {
    setIsDefiningPolygon(false);
    if (polygonPoints.length >= 3) {
      const area = calculatePolygonArea(polygonPoints);
      setDefinedPolygonAreaPixels(area);
      setPolygonBounds(getPolygonBounds(polygonPoints));
      console.log(`Polygon defined with ${polygonPoints.length} points. Area: ${area.toFixed(2)} pixels^2`);
    } else {
      console.warn("Polygon needs at least 3 points.");
      // Reset if not enough points?
      setPolygonPoints([]);
      setDefinedPolygonAreaPixels(null);
      setPolygonBounds(null);
    }
  };

   const handleResetPolygon = () => {
    setIsDefiningPolygon(false);
    setPolygonPoints([]);
    setSplitNaturalX(null);
    setSplitNaturalY(null);
    setDefinedPolygonAreaPixels(null);
    setPolygonBounds(null);
  };

  // --- Image and Click Handlers ---
  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = event.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    // Reset polygon state if image changes
    handleResetPolygon();
  };

  const handleImageClick = (event: MouseEvent<HTMLDivElement | HTMLImageElement>) => { // Update type to include HTMLImageElement
    const targetElement = imageRef.current;
    if (!targetElement || !imageDimensions) {
        console.log("handleImageClick: Aborted - no targetElement or imageDimensions");
        return;
    }
    console.log("handleImageClick: Fired"); // Log start

    // ... existing coordinate calculation ...
    const rect = targetElement.getBoundingClientRect();
    const displayedWidth = targetElement.clientWidth;
    const scaleX = imageDimensions.width / displayedWidth;
    const displayedHeight = targetElement.clientHeight;
    const scaleY = imageDimensions.height / displayedHeight;

    const naturalX = (event.clientX - rect.left) * scaleX;
    const naturalY = (event.clientY - rect.top) * scaleY;
    const clickPoint = { x: naturalX, y: naturalY };
    console.log(`handleImageClick: Click Point (Natural): { x: ${naturalX.toFixed(2)}, y: ${naturalY.toFixed(2)} }`);


    console.log(`handleImageClick: isDefiningPolygon = ${isDefiningPolygon}`); // Log state
    if (isDefiningPolygon) {
      // Add vertex
      console.log("handleImageClick: Adding polygon point.");
      setPolygonPoints(prevPoints => [...prevPoints, clickPoint]);
    } else {
        console.log(`handleImageClick: Not defining polygon. Polygon points count: ${polygonPoints.length}`); // Log state
        if (polygonPoints.length >= 3) {
            console.log("handleImageClick: Checking if point is in polygon...");
            const isInside = isPointInPolygon(clickPoint, polygonPoints); // Call the updated function
            console.log(`handleImageClick: isPointInPolygon result: ${isInside}`); // Log check result

            // Set split line if click is inside the defined polygon
            if (isInside) {
                console.log("handleImageClick: Point is inside. Setting split line."); // Re-enabled log message
                const clampedNaturalX = Math.max(0, Math.min(naturalX, imageDimensions.width));
                const clampedNaturalY = Math.max(0, Math.min(naturalY, imageDimensions.height));

                // Re-enable state updates
                if (splitDirection === 'vertical') {
                    console.log(`handleImageClick: Setting vertical split to X = ${clampedNaturalX.toFixed(2)}`);
                    setSplitNaturalX(clampedNaturalX);
                    setSplitNaturalY(null); // Clear the other direction
                } else {
                    console.log(`handleImageClick: Setting horizontal split to Y = ${clampedNaturalY.toFixed(2)}`);
                    setSplitNaturalY(clampedNaturalY);
                    setSplitNaturalX(null); // Clear the other direction
                }
            } else {
                console.log("handleImageClick: Click is outside the defined polygon. Split line not changed.");
            }
        } else {
            console.log("handleImageClick: Not enough polygon points to set split line.");
        }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageSrc(reader.result as string);
        // Reset everything related to polygon and split
        handleResetPolygon();
        setImageDimensions(null); // Will trigger reload and reset via handleImageLoad
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Area Calculation ---
  const calculateAreas = () => {
    const isSplitDefined = splitNaturalX !== null || splitNaturalY !== null;
    if (!isSplitDefined || polygonPoints.length < 3 || initialSqM <= 0 || !polygonBounds) {
      return { area1: 0, area2: 0, label1: 'Area 1', label2: 'Area 2' }; // Use generic labels initially
    }

    let ratio: number;
    let label1: string;
    let label2: string;

    if (splitDirection === 'vertical' && splitNaturalX !== null) {
        // --- Simple Bounding Box Ratio Method (Vertical Split) ---
        const relativeSplitX = splitNaturalX - polygonBounds.x;
        const clampedRelativeSplitX = Math.max(0, Math.min(relativeSplitX, polygonBounds.width));
        ratio = polygonBounds.width > 0 ? clampedRelativeSplitX / polygonBounds.width : 0;
        label1 = 'Left Area';
        label2 = 'Right Area';
    } else if (splitDirection === 'horizontal' && splitNaturalY !== null) {
        // --- Simple Bounding Box Ratio Method (Horizontal Split) ---
        const relativeSplitY = splitNaturalY - polygonBounds.y;
        const clampedRelativeSplitY = Math.max(0, Math.min(relativeSplitY, polygonBounds.height));
        ratio = polygonBounds.height > 0 ? clampedRelativeSplitY / polygonBounds.height : 0;
        label1 = 'Top Area';
        label2 = 'Bottom Area';
    } else {
        // Should not happen if isSplitDefined is true, but handle defensively
        return { area1: 0, area2: 0, label1: 'Area 1', label2: 'Area 2' };
    }

    // Distribute initialSqM based on the calculated ratio
    const area1 = initialSqM * ratio;
    const area2 = initialSqM * (1 - ratio);

    return { area1, area2, label1, label2 };
  };

  const { area1, area2, label1, label2 } = calculateAreas();

  // --- Display Calculations ---
  const getDisplaySplitX = () => {
    if (splitNaturalX === null || !imageDimensions || !imageRef.current) {
      return null;
    }
    const displayedWidth = imageRef.current.clientWidth;
    const naturalWidth = imageDimensions.width;
    if (naturalWidth === 0) return 0;
    const scaleX = displayedWidth / naturalWidth;
    return splitNaturalX * scaleX;
  };

  const getDisplaySplitY = () => {
    if (splitNaturalY === null || !imageDimensions || !imageRef.current) {
        return null;
    }
    const displayedHeight = imageRef.current.clientHeight;
    const naturalHeight = imageDimensions.height;
    if (naturalHeight === 0) return 0;
    const scaleY = displayedHeight / naturalHeight;
    return splitNaturalY * scaleY;
  };

  const displaySplitX = getDisplaySplitX();
  const displaySplitY = getDisplaySplitY();

  // Convert natural polygon points to display coordinates for rendering
  const getDisplayPolygonPoints = (): string => {
      if (!imageRef.current || !imageDimensions || polygonPoints.length === 0) return "";
      const scaleX = imageRef.current.clientWidth / imageDimensions.width;
      const scaleY = imageRef.current.clientHeight / imageDimensions.height;
      return polygonPoints.map(p => `${p.x * scaleX},${p.y * scaleY}`).join(' ');
  };
  const displayPolygonPointsStr = getDisplayPolygonPoints();

  // Add a simple logger for the container click
  const handleContainerClick = (event: MouseEvent<HTMLDivElement>) => {
      console.log("Container Clicked!", event.target);
  };

  return (
    <div className="App">
      <h1>Parcel Splitter</h1>
      <div className="controls">
        <label>
          Initial Square Meters (of defined area):
          <input
            type="number"
            value={initialSqM}
            onChange={(e) => setInitialSqM(Number(e.target.value))}
            min="1"
          />
        </label>
        <label>
          Upload Parcel Image:
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>
      </div>
      <div className="controls polygon-controls">
        <button onClick={handleStartDefining} disabled={!imageSrc || isDefiningPolygon}>
          Start/Add Point
        </button>
        <button onClick={handleFinishDefining} disabled={!isDefiningPolygon || polygonPoints.length < 3}>
          Finish Polygon
        </button>
        <button onClick={handleResetPolygon} disabled={polygonPoints.length === 0}>
          Reset Polygon
        </button>
        {isDefiningPolygon && <p>Click on the image to define polygon corners.</p>}
      </div>

      {polygonPoints.length >= 3 && !isDefiningPolygon && (
        <div className="controls split-controls">
          <label>Split Direction:</label>
          <label>
            <input
              type="radio"
              name="splitDirection"
              value="vertical"
              checked={splitDirection === 'vertical'}
              onChange={() => setSplitDirection('vertical')}
            /> Vertical
          </label>
          <label>
            <input
              type="radio"
              name="splitDirection"
              value="horizontal"
              checked={splitDirection === 'horizontal'}
              onChange={() => setSplitDirection('horizontal')}
            /> Horizontal
          </label>
          <p>Click inside the polygon to set the {splitDirection} split line.</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {imageSrc && (
          <div
            ref={imageContainerRef}
            className="image-container"
            onClick={handleContainerClick} // Add logger here
            style={{
              position: 'relative',
              display: 'inline-block',
              border: '1px solid red' // Add border for visual debugging
            }}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Parcel"
              onLoad={handleImageLoad}
              className="parcel-image"
              onClick={handleImageClick} // This is the main handler
              style={{
                cursor: isDefiningPolygon ? 'crosshair' : (polygonPoints.length >= 3 ? 'crosshair' : 'default'),
                display: 'block',
                maxWidth: '100%',
                height: 'auto',
                userSelect: 'none'
              }}
            />
            {/* SVG Overlay for drawing polygon and split line */}
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none' // Allow clicks to pass through to the image
              }}
              viewBox={`0 0 ${imageRef.current?.clientWidth ?? 0} ${imageRef.current?.clientHeight ?? 0}`}
              preserveAspectRatio="none" // Ensure SVG scales with image container
            >
              {/* Draw polygon lines */}
              {polygonPoints.length > 1 && (
                <polyline
                  points={displayPolygonPointsStr}
                  fill="rgba(0, 255, 0, 0.2)" // Semi-transparent green fill
                  stroke="lime"
                  strokeWidth="2"
                />
              )}
              {/* Draw closing line if defining */}
              {isDefiningPolygon && polygonPoints.length > 2 && (
                <line
                  x1={polygonPoints[polygonPoints.length - 1].x * (imageRef.current?.clientWidth ?? 0) / (imageDimensions?.width ?? 1)}
                  y1={polygonPoints[polygonPoints.length - 1].y * (imageRef.current?.clientHeight ?? 0) / (imageDimensions?.height ?? 1)}
                  x2={polygonPoints[0].x * (imageRef.current?.clientWidth ?? 0) / (imageDimensions?.width ?? 1)}
                  y2={polygonPoints[0].y * (imageRef.current?.clientHeight ?? 0) / (imageDimensions?.height ?? 1)}
                  stroke="lime"
                  strokeWidth="1"
                  strokeDasharray="4 2" // Dashed line for closing segment during definition
                />
              )}
              {/* Draw vertices */}
              {polygonPoints.map((p, index) => {
                const scaleX = (imageRef.current?.clientWidth ?? 0) / (imageDimensions?.width ?? 1);
                const scaleY = (imageRef.current?.clientHeight ?? 0) / (imageDimensions?.height ?? 1);
                return (
                  <circle
                    key={index}
                    cx={p.x * scaleX}
                    cy={p.y * scaleY}
                    r="3" // Radius of vertex circle
                    fill="red"
                  />
                );
              })}

              {/* Draw split line (conditionally vertical or horizontal) */}
              {splitDirection === 'vertical' && displaySplitX !== null && (
                <line
                  x1={displaySplitX}
                  y1="0"
                  x2={displaySplitX}
                  y2="100%" // Use percentage for full height/width
                  stroke="blue"
                  strokeWidth="2"
                />
              )}
              {splitDirection === 'horizontal' && displaySplitY !== null && (
                 <line
                  x1="0"
                  y1={displaySplitY}
                  x2="100%" // Use percentage for full height/width
                  y2={displaySplitY}
                  stroke="blue"
                  strokeWidth="2"
                />
              )}
            </svg>
          </div>
        )}

        {/* Results display moved to the right */}
        {(splitNaturalX !== null || splitNaturalY !== null) && definedPolygonAreaPixels !== null && polygonPoints.length >= 3 && (
          <div className="results" style={{ minWidth: '200px', padding: '10px' }}>
            <h2>Split Results ({splitDirection})</h2>
            <p>{label1}: {area1.toFixed(2)} sq m ({((area1 / initialSqM) * 100).toFixed(1)}%)</p>
            <p>{label2}: {area2.toFixed(2)} sq m ({((area2 / initialSqM) * 100).toFixed(1)}%)</p>
            <p>(Total Defined Area: {initialSqM.toFixed(2)} sq m)</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
