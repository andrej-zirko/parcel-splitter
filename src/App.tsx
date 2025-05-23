import React, { useState, useRef, MouseEvent, useCallback, useMemo } from 'react';
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
  let isInside = false;
  if (polygon.length < 3) {
      return false; // Cannot be inside if polygon is not valid
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    // Check for horizontal line segment to avoid division by zero
    if (yj === yi) {
        // If point.y is the same as the horizontal line's y, check if point.x is between xi and xj
        if (point.y === yi && point.x >= Math.min(xi, xj) && point.x <= Math.max(xi, xj)) {
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
  return isInside;
};


// --- Sutherland-Hodgman Polygon Clipping ---

// Calculates intersection of a line segment (p1, p2) with an infinite line
// representing a clipping edge (vertical at x=coord or horizontal at y=coord).
function intersectSH(p1: PixelCoord, p2: PixelCoord, edgeType: 'left' | 'right' | 'top' | 'bottom', coord: number): PixelCoord {
    if (edgeType === 'left' || edgeType === 'right') { // Vertical clip edge at x = coord
        const x = coord;
        // Handle vertical subject edge (parallel to clip edge) - return an endpoint?
        if (Math.abs(p2.x - p1.x) < 1e-9) {
             // This case needs careful handling depending on exact requirements.
             // Returning mid-point or an endpoint might be options.
             // For simplicity, let's return a point on the edge.
             return { x, y: p1.y };
        }
        const y = p1.y + (p2.y - p1.y) * (x - p1.x) / (p2.x - p1.x);
        return { x, y };
    } else { // Horizontal clip edge at y = coord
        const y = coord;
        // Handle horizontal subject edge (parallel to clip edge)
        if (Math.abs(p2.y - p1.y) < 1e-9) {
            return { x: p1.x, y };
        }
        const x = p1.x + (p2.x - p1.x) * (y - p1.y) / (p2.y - p1.y);
        return { x, y };
    }
}

// Clips the subject polygon against a single infinite line (clip edge).
function clipPolygonAgainstEdgeSH(subjectPolygon: PixelCoord[], edgeType: 'left' | 'right' | 'top' | 'bottom', coord: number, insideCheck: (p: PixelCoord) => boolean): PixelCoord[] {
    const outputList: PixelCoord[] = [];
    if (subjectPolygon.length === 0) return [];

    let prevPoint = subjectPolygon[subjectPolygon.length - 1];
    let prevPointInside = insideCheck(prevPoint);

    for (let i = 0; i < subjectPolygon.length; i++) {
        const currentPoint = subjectPolygon[i];
        const currentPointInside = insideCheck(currentPoint);

        if (currentPointInside !== prevPointInside) { // Crossing
            const intersection = intersectSH(prevPoint, currentPoint, edgeType, coord);
            outputList.push(intersection);
        }

        if (currentPointInside) {
            outputList.push(currentPoint);
        }
        prevPoint = currentPoint;
        prevPointInside = currentPointInside;
    }
    return outputList;
}

// Clips the subject polygon against the four edges of a rectangular clip window.
function clipPolygonSutherlandHodgman(subjectPolygon: PixelCoord[], clipBounds: Bounds): PixelCoord[] {
    // Use a large epsilon for bounds checks to avoid floating point issues near boundaries
    const epsilon = 1e-6;
    if (!clipBounds || subjectPolygon.length < 3) return [];
    let outputList = subjectPolygon;

    const { x: minX, y: minY, width, height } = clipBounds;
    // Handle potentially zero or negative width/height gracefully for clipping
    const maxX = minX + Math.max(0, width);
    const maxY = minY + Math.max(0, height);

    // Clip against left edge (x = minX) -> Keep points with p.x >= minX
    outputList = clipPolygonAgainstEdgeSH(outputList, 'left', minX, p => p.x >= minX - epsilon);
    // Clip against right edge (x = maxX) -> Keep points with p.x <= maxX
    outputList = clipPolygonAgainstEdgeSH(outputList, 'right', maxX, p => p.x <= maxX + epsilon);
    // Clip against top edge (y = minY) -> Keep points with p.y >= minY (Y increases downwards)
    outputList = clipPolygonAgainstEdgeSH(outputList, 'top', minY, p => p.y >= minY - epsilon);
    // Clip against bottom edge (y = maxY) -> Keep points with p.y <= maxY
    outputList = clipPolygonAgainstEdgeSH(outputList, 'bottom', maxY, p => p.y <= maxY + epsilon);

    return outputList;
}

// --- End Sutherland-Hodgman ---

function App() {
  const [initialSqM, setInitialSqM] = useState<number>(1000);
  const [initialSqMError, setInitialSqMError] = useState<string>(''); // New state for input error
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string>(''); // New state for image errors
  const [splitNaturalX, setSplitNaturalX] = useState<number | null>(null); // Vertical split line X coord (natural)
  const [splitNaturalY, setSplitNaturalY] = useState<number | null>(null); // Horizontal split line Y coord (natural)
  const [splitDirection, setSplitDirection] = useState<SplitDirection>('vertical'); // Split direction
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<PixelCoord[]>([]); // User-defined vertices
  const [isDefiningPolygon, setIsDefiningPolygon] = useState<boolean>(false); // Mode flag
  const [definedPolygonAreaPixels, setDefinedPolygonAreaPixels] = useState<number | null>(null); // Area in pixels^2
  const [showHowTo, setShowHowTo] = useState<boolean>(false); // State for How-to GIF visibility

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // --- Mode Control Handlers ---
  const handleStartDefining = () => {
    setIsDefiningPolygon(true);
    setPolygonPoints([]); // Reset points when starting
    setSplitNaturalX(null);
    setSplitNaturalY(null);
    setDefinedPolygonAreaPixels(null);
  };

  const handleFinishDefining = () => {
    setIsDefiningPolygon(false);
    if (polygonPoints.length >= 3) {
      const area = calculatePolygonArea(polygonPoints);
      setDefinedPolygonAreaPixels(area);
    } else {
      setPolygonPoints([]);
      setDefinedPolygonAreaPixels(null);
    }
  };

  const handleResetPolygon = () => {
    setIsDefiningPolygon(false);
    setPolygonPoints([]);
    setSplitNaturalX(null);
    setSplitNaturalY(null);
    setDefinedPolygonAreaPixels(null);
  };

  const handleUndoPoint = () => {
    if (isDefiningPolygon && polygonPoints.length > 0) {
      setPolygonPoints(prevPoints => prevPoints.slice(0, -1));
      if (polygonPoints.length <= 3) {
        setDefinedPolygonAreaPixels(null);
      }
    }
  };

  // --- Image and Click Handlers ---
  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = event.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageError(''); // Clear error on successful load
    handleResetPolygon();
  };

  const handleImageError = () => {
    setImageError('Failed to load image. Please try a different file or check the file format.');
    setImageSrc(null);
    setImageDimensions(null);
    handleResetPolygon();
  };

  const handleImageClick = (event: MouseEvent<HTMLDivElement | HTMLImageElement>) => {
    const targetElement = imageRef.current;
    if (!targetElement || !imageDimensions) {
        return;
    }

    const rect = targetElement.getBoundingClientRect();
    const displayedWidth = targetElement.clientWidth;
    const scaleX = imageDimensions.width / displayedWidth;
    const displayedHeight = targetElement.clientHeight;
    const scaleY = imageDimensions.height / displayedHeight;

    const naturalX = (event.clientX - rect.left) * scaleX;
    const naturalY = (event.clientY - rect.top) * scaleY;
    const clickPoint = { x: naturalX, y: naturalY };

    if (isDefiningPolygon) {
      setPolygonPoints(prevPoints => [...prevPoints, clickPoint]);
    } else {
        if (polygonPoints.length >= 3) {
            const isInside = isPointInPolygon(clickPoint, polygonPoints);

            if (isInside) {
                const clampedNaturalX = Math.max(0, Math.min(naturalX, imageDimensions.width));
                const clampedNaturalY = Math.max(0, Math.min(naturalY, imageDimensions.height));

                if (splitDirection === 'vertical') {
                    setSplitNaturalX(clampedNaturalX);
                    setSplitNaturalY(null);
                } else {
                    setSplitNaturalY(clampedNaturalY);
                    setSplitNaturalX(null);
                }
            }
        }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setImageError(''); // Clear previous errors
    if (file) {
      // Basic file type check
      if (!file.type.startsWith('image/')) {
          setImageError('Invalid file type. Please upload an image file (e.g., JPG, PNG, GIF).');
          setImageSrc(null);
          setImageDimensions(null);
          handleResetPolygon();
          event.target.value = ''; // Reset file input
          return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setImageSrc(reader.result as string);
        handleResetPolygon();
        setImageDimensions(null); // Reset dimensions until image loads
      };
      reader.onerror = () => {
          setImageError('Error reading file.');
          setImageSrc(null);
          setImageDimensions(null);
          handleResetPolygon();
      };
      reader.readAsDataURL(file);
    } else {
        // Handle case where user cancels file selection
        // No explicit error needed, just ensure state is clean if needed
    }
  };

  // --- Area Calculation (Revised) ---
  const calculateAreas = useCallback((imgDims: { width: number; height: number } | null) => {
    // Ensure initialSqM is positive for calculation
    const validInitialSqM = Math.max(0, initialSqM);
    const isSplitDefined = splitNaturalX !== null || splitNaturalY !== null;
    if (!isSplitDefined || polygonPoints.length < 3 || validInitialSqM <= 0 || !imgDims) {
      return { area1: 0, area2: 0, label1: 'Area 1', label2: 'Area 2', subPoly1: [], subPoly2: [] };
    }

    let clipBounds1: Bounds = null;
    let clipBounds2: Bounds = null;
    let label1: string = 'Area 1';
    let label2: string = 'Area 2';

    if (splitDirection === 'vertical' && splitNaturalX !== null) {
        const splitX = splitNaturalX;
        clipBounds1 = { x: 0, y: 0, width: splitX, height: imgDims.height };
        clipBounds2 = { x: splitX, y: 0, width: imgDims.width - splitX, height: imgDims.height };
        label1 = 'Left Area';
        label2 = 'Right Area';
    } else if (splitDirection === 'horizontal' && splitNaturalY !== null) {
        const splitY = splitNaturalY;
        clipBounds1 = { x: 0, y: 0, width: imgDims.width, height: splitY };
        clipBounds2 = { x: 0, y: splitY, width: imgDims.width, height: imgDims.height - splitY };
        label1 = 'Top Area';
        label2 = 'Bottom Area';
    } else {
        return { area1: 0, area2: 0, label1: 'Area 1', label2: 'Area 2', subPoly1: [], subPoly2: [] };
    }

    const subPolygon1 = clipPolygonSutherlandHodgman(polygonPoints, clipBounds1);
    const subPolygon2 = clipPolygonSutherlandHodgman(polygonPoints, clipBounds2);

    const area1_pixels = calculatePolygonArea(subPolygon1);
    const area2_pixels = calculatePolygonArea(subPolygon2);
    const total_pixels = area1_pixels + area2_pixels;

    let ratio: number = 0;
    if (total_pixels > 1e-6) {
        ratio = area1_pixels / total_pixels;
    } else if (area1_pixels > 1e-6) {
        ratio = 1.0;
    } else {
        ratio = 0.0;
    }

    const area1_sqm = validInitialSqM * ratio;
    const area2_sqm = validInitialSqM * (1 - ratio);

    return { area1: area1_sqm, area2: area2_sqm, label1, label2, subPoly1: subPolygon1, subPoly2: subPolygon2 };
  }, [polygonPoints, initialSqM, splitDirection, splitNaturalX, splitNaturalY]);

  const { area1, area2, label1, label2 } = useMemo(() => calculateAreas(imageDimensions), [calculateAreas, imageDimensions]);

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
  const isSplitActive = (splitDirection === 'vertical' && displaySplitX !== null) ||
                        (splitDirection === 'horizontal' && displaySplitY !== null);

  const getDisplayPolygonPoints = (): string => {
      if (!imageRef.current || !imageDimensions || polygonPoints.length === 0) return "";
      const scaleX = imageRef.current.clientWidth / imageDimensions.width;
      const scaleY = imageRef.current.clientHeight / imageDimensions.height;
      return polygonPoints.map(p => `${p.x * scaleX},${p.y * scaleY}`).join(' ');
  };
  const displayPolygonPointsStr = getDisplayPolygonPoints();

  const handleChangeSplitDirection = (newDirection: SplitDirection) => {
    setSplitDirection(newDirection);
    setSplitNaturalX(null);
    setSplitNaturalY(null);
  };

  const handleInitialSqMChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const numValue = Number(value);
      if (value === '' || (numValue > 0 && !isNaN(numValue))) {
          setInitialSqM(numValue);
          setInitialSqMError('');
      } else if (numValue <= 0 || isNaN(numValue)) {
          setInitialSqMError('Please enter a positive number for square meters.');
          setInitialSqM(0);
      }
  };

  const toggleHowTo = () => {
    setShowHowTo(prev => !prev);
  };

  return (
    <div className="App">
      <h1>Parcel Splitter</h1>
      <p style={{ maxWidth: '800px', margin: '10px auto 20px auto', color: '#333' }}>
        Easily visualize splitting a defined land parcel (polygon) into two sections. Simply upload an image, define the parcel boundaries, choose a split direction (vertical or horizontal), and click inside the defined area to instantly see the calculated square meters for each resulting section based on your initial total area input.
      </p>
      <div className="controls">
        <label>
          Initial Square Meters (of defined area):
          <input
            type="number"
            value={initialSqM === 0 && initialSqMError ? '' : initialSqM}
            onChange={handleInitialSqMChange}
            min="1"
            aria-invalid={!!initialSqMError}
            aria-describedby="sqm-error"
          />
        </label>
        {initialSqMError && <p id="sqm-error" style={{ color: 'red', fontSize: '0.8em' }}>{initialSqMError}</p>}
        <label>
          Upload Parcel Image:
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>
        {imageError && <p style={{ color: 'red', fontSize: '0.8em' }}>{imageError}</p>}
        <button onClick={toggleHowTo} style={{ marginLeft: '10px', padding: '5px 10px' }}>
          {showHowTo ? 'Hide How-to Guide' : 'Show How-to Guide'}
        </button>
      </div>

      {showHowTo && (
        <div className="how-to-guide" style={{ margin: '20px 0', padding: '10px', border: '1px dashed #ccc', textAlign: 'center' }}>
          <h3>How to Use:</h3>
          <img
            src="/how-to.gif" // Assuming the GIF is in the public folder
            alt="How-to guide animation"
            style={{ maxWidth: '100%', maxHeight: '400px', border: '1px solid #eee' }}
          />
          <p style={{ fontSize: '0.9em', marginTop: '10px' }}>
            1. Enter the total area (sq m). 2. Upload an image. 3. Define the polygon area. 4. Choose split direction. 5. Click inside the polygon to split.
          </p>
        </div>
      )}

      <div className="controls polygon-controls">
        <button onClick={handleStartDefining} disabled={!imageSrc || isDefiningPolygon}>
          Start/Add Point
        </button>
        <button onClick={handleUndoPoint} disabled={!isDefiningPolygon || polygonPoints.length === 0}>
          Undo Last Point
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
              onChange={() => handleChangeSplitDirection('vertical')}
            /> Vertical
          </label>
          <label>
            <input
              type="radio"
              name="splitDirection"
              value="horizontal"
              checked={splitDirection === 'horizontal'}
              onChange={() => handleChangeSplitDirection('horizontal')}
            /> Horizontal
          </label>
          <p>Click inside the polygon to set the {splitDirection} split line.</p>
        </div>
      )}

      {/* Main content area: Image + Results */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap', // Allow items to wrap to the next line
        gap: '20px',      // Space between items
        alignItems: 'flex-start' // Align items to the top
      }}>
        {imageSrc && !imageError && (
          <div
            ref={imageContainerRef}
            className="image-container"
            style={{
              position: 'relative',
              border: '1px solid grey', // Changed border color slightly
              flex: '1 1 60%', // Allow growing/shrinking, base width 60%
              minWidth: '300px', // Ensure it doesn't get too small
              maxWidth: '800px' // Optional: Limit max width
            }}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Parcel"
              onLoad={handleImageLoad}
              onError={handleImageError}
              className="parcel-image"
              onClick={handleImageClick}
              style={{
                cursor: isDefiningPolygon ? 'crosshair' : (polygonPoints.length >= 3 ? 'crosshair' : 'default'),
                display: 'block',
                maxWidth: '100%',
                height: 'auto',
                userSelect: 'none'
              }}
            />
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none'
              }}
              viewBox={`0 0 ${imageRef.current?.clientWidth ?? 0} ${imageRef.current?.clientHeight ?? 0}`}
              preserveAspectRatio="none"
            >
              <defs>
                {isSplitActive && imageRef.current && (
                  <>
                    <clipPath id="clip-area1">
                      {splitDirection === 'vertical' && displaySplitX !== null ? (
                        <rect x="0" y="0" width={displaySplitX} height={imageRef.current.clientHeight} />
                      ) : (splitDirection === 'horizontal' && displaySplitY !== null &&
                        <rect x="0" y="0" width={imageRef.current.clientWidth} height={displaySplitY} />
                      )}
                    </clipPath>
                    <clipPath id="clip-area2">
                      {splitDirection === 'vertical' && displaySplitX !== null ? (
                        <rect x={displaySplitX} y="0" width={(imageRef.current.clientWidth ?? 0) - displaySplitX} height={imageRef.current.clientHeight} />
                      ) : (splitDirection === 'horizontal' && displaySplitY !== null &&
                        <rect x="0" y={displaySplitY} width={imageRef.current.clientWidth} height={(imageRef.current.clientHeight ?? 0) - displaySplitY} />
                      )}
                    </clipPath>
                  </>
                )}
              </defs>

              {polygonPoints.length >= 3 && displayPolygonPointsStr && (
                <>
                  {!isSplitActive ? (
                    <polygon
                      points={displayPolygonPointsStr}
                      fill="rgba(0, 255, 0, 0.2)"
                      stroke="none"
                    />
                  ) : (
                    <>
                      <polygon
                        points={displayPolygonPointsStr}
                        fill="rgba(0, 255, 0, 0.3)"
                        clipPath="url(#clip-area1)"
                        stroke="none"
                      />
                      <polygon
                        points={displayPolygonPointsStr}
                        fill="rgba(255, 0, 0, 0.3)"
                        clipPath="url(#clip-area2)"
                        stroke="none"
                      />
                    </>
                  )}
                </>
              )}

              {polygonPoints.length >= 3 && displayPolygonPointsStr && (
                <polygon
                  points={displayPolygonPointsStr}
                  fill="none"
                  stroke="lime"
                  strokeWidth="2"
                />
              )}
              {isDefiningPolygon && polygonPoints.length > 2 && (
                <line
                  x1={polygonPoints[polygonPoints.length - 1].x * (imageRef.current?.clientWidth ?? 0) / (imageDimensions?.width ?? 1)}
                  y1={polygonPoints[polygonPoints.length - 1].y * (imageRef.current?.clientHeight ?? 0) / (imageDimensions?.height ?? 1)}
                  x2={polygonPoints[0].x * (imageRef.current?.clientWidth ?? 0) / (imageDimensions?.width ?? 1)}
                  y2={polygonPoints[0].y * (imageRef.current?.clientHeight ?? 0) / (imageDimensions?.height ?? 1)}
                  stroke="lime"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
              )}
              {polygonPoints.map((p, index) => {
                const scaleX = (imageRef.current?.clientWidth ?? 0) / (imageDimensions?.width ?? 1);
                const scaleY = (imageRef.current?.clientHeight ?? 0) / (imageDimensions?.height ?? 1);
                return (
                  <circle
                    key={index}
                    cx={p.x * scaleX}
                    cy={p.y * scaleY}
                    r="3"
                    fill="red"
                  />
                );
              })}

              {splitDirection === 'vertical' && displaySplitX !== null && (
                <line
                  x1={displaySplitX}
                  y1="0"
                  x2={displaySplitX}
                  y2="100%"
                  stroke="blue"
                  strokeWidth="2"
                />
              )}
              {splitDirection === 'horizontal' && displaySplitY !== null && (
                 <line
                  x1="0"
                  y1={displaySplitY}
                  x2="100%"
                  y2={displaySplitY}
                  stroke="blue"
                  strokeWidth="2"
                />
              )}
            </svg>
          </div>
        )}

        {polygonPoints.length >= 3 && !isDefiningPolygon && (
          <div
            className="results"
            style={{
              flex: '1 1 35%', // Allow growing/shrinking, base width 35%
              minWidth: '250px', // Ensure it has a minimum width
              padding: '10px',
              border: '1px solid #eee', // Add a light border for visual separation
              borderRadius: '4px'
             }}
          >
            <h2>{isSplitActive ? `Split Results (${splitDirection})` : 'Area Information'}</h2>
            {isSplitActive ? (
              <>
                <p>{label1}: {area1.toFixed(2)} sq m ({initialSqM > 0 && (area1 + area2) > 1e-6 ? ((area1 / (area1+area2)) * 100).toFixed(1) : 0}%)</p>
                <p>{label2}: {area2.toFixed(2)} sq m ({initialSqM > 0 && (area1 + area2) > 1e-6 ? ((area2 / (area1+area2)) * 100).toFixed(1) : 0}%)</p>
                {(area1 + area2 > 0) && Math.abs((area1 + area2) - initialSqM) > 0.01 &&
                    <p style={{fontSize: '0.8em', color: 'orange'}}>Note: Total split area ({ (area1 + area2).toFixed(2) }) differs slightly from initial input due to calculation precision.</p>
                }
              </>
            ) : (
              <p>No split defined yet. Click inside the polygon to create a split.</p>
            )}
            <p>Total Defined Area Input: {initialSqM > 0 ? initialSqM.toFixed(2) : '0.00'} sq m</p>
            {definedPolygonAreaPixels !== null && (
                 <p style={{fontSize: '0.8em', color: '#666'}}>(Original Polygon Area in Pixels: {definedPolygonAreaPixels.toFixed(0)})</p>
            )}
          </div>
        )}
      </div>

      {/* Add Disclaimer Section */}
      <div className="disclaimer" style={{ marginTop: '40px', padding: '20px', borderTop: '1px solid #ccc', fontSize: '0.9em', color: '#555', textAlign: 'left' }}>
        <h2>Disclaimer</h2>
        <p>This tool is provided free of charge and "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
        <p>The calculations performed by this tool are for informational purposes only. We make no guarantees regarding the accuracy or reliability of the results.</p>
        <p>In no event shall the creators or operators of this website be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.</p>
        <p>For feedback or questions, please contact: <a href="mailto:andrej+parcel@zirko.eu">andrej+parcel@zirko.eu</a></p>
        <p>By using this tool, you agree to these terms.</p>
      </div>
    </div>
  );
}

export default App;
