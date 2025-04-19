# Parcel Splitter

A web application built with React, TypeScript, and Vite that allows users to visually define a land parcel on an uploaded image and calculate the areas of two resulting sections after splitting it vertically or horizontally.

## Features

*   **Image Upload:** Upload an image (e.g., a map or survey plan) of the land parcel.
*   **Polygon Definition:** Interactively define the boundaries of the parcel by clicking on the image to place vertices.
*   **Polygon Editing:** Undo the last point added or reset the entire polygon definition.
*   **Area Input:** Specify the total known area (in square meters) of the defined parcel.
*   **Visual Splitting:** Choose a split direction (vertical or horizontal) and click inside the defined polygon to place a split line.
*   **Area Calculation:** Automatically calculates the approximate area of the two resulting sections based on the split line's position and the initial total area.
*   **Results Display:** Shows the calculated square meters and percentage for each section.
*   **Responsive Design:** Adapts to different screen sizes.
*   **How-to Guide:** Includes a visual guide on using the application.
*   **Disclaimer:** Provides important information regarding the tool's accuracy and liability.

## How to Use

1.  **Enter Total Area:** Input the known total square meters of the parcel you intend to define in the "Initial Square Meters" field.
2.  **Upload Image:** Click the "Upload Parcel Image" button and select an image file from your device.
3.  **Define Polygon:**
    *   Click the "Start/Add Point" button.
    *   Click on the image to place the corners (vertices) of your parcel. You need at least 3 points.
    *   Use "Undo Last Point" if you make a mistake.
    *   Click "Finish Polygon" when done.
    *   Use "Reset Polygon" to start over.
4.  **Choose Split Direction:** Select either "Vertical" or "Horizontal" for the split line.
5.  **Split the Area:** Click *inside* the defined polygon on the image where you want the split line to be placed.
6.  **View Results:** The calculated areas for the two sections will appear in the results panel.

## Technologies Used

*   React 19
*   TypeScript
*   Vite
*   CSS Modules (via `App.css` and `index.css`)
*   ESLint + TypeScript ESLint

## Running Locally

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm run dev
    ```

## Disclaimer

This tool is provided for informational purposes only and comes with no warranty regarding the accuracy of calculations. Please refer to the full disclaimer within the application.

## Feedback

For feedback or questions, please contact: andrej+parcel@zirko.eu
