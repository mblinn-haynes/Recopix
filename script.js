document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const TARGET_SIZE = 48; // Target mosaic resolution (pixels)
    const BORDER_THICKNESS = 0; // Border removed as requested

    const COLOURS_DATA = {
        "Black": {"rgb": [27, 42, 52], "count": 698},
        "Bright Light Blue": {"rgb": [175, 221, 255], "count": 57},
        "Bright Light Orange": {"rgb": [255, 176, 100], "count": 65},
        "Dark Blue": {"rgb": [0, 16, 176], "count": 121},
        "Dark Bluish Gray": {"rgb": [99, 95, 98], "count": 141},
        "Dark Brown": {"rgb": [53, 33, 0], "count": 554},
        "Dark Orange": {"rgb": [176, 96, 16], "count": 85},
        "Dark Tan": {"rgb": [149, 138, 115], "count": 137},
        "Light Bluish Gray": {"rgb": [183, 195, 205], "count": 51},
        "Medium Nougat": {"rgb": [170, 125, 85], "count": 29},
        "Orange": {"rgb": [255, 88, 0], "count": 74},
        "Reddish Brown": {"rgb": [105, 64, 40], "count": 250},
        "Sand Blue": {"rgb": [116, 134, 157], "count": 52},
        "Tan": {"rgb": [222, 198, 156], "count": 283},
        "White": {"rgb": [244, 244, 244], "count": 149}
    };

    // Store original counts for summary calculation
    const ORIGINAL_COUNTS = Object.fromEntries(
        Object.entries(COLOURS_DATA).map(([name, data]) => [name, data.count])
    );
    
    // --- DOM Elements ---
    const fileInput = document.getElementById('fileInput');
    const editorCanvas = document.getElementById('editorCanvas');
    const editorCtx = editorCanvas.getContext('2d');
    const mosaicCanvas = document.getElementById('mosaicCanvas');
    const mosaicCtx = mosaicCanvas.getContext('2d');
    const generateButton = document.getElementById('generateButton');
    const summaryOutput = document.getElementById('summaryOutput');
    const editorColourPicker = document.getElementById('editorColorPicker');
    const currentColourDisplay = document.getElementById('currentColorDisplay');
    const hoverInfo = document.getElementById('hoverInfo');
    const resDisplay = document.getElementById('res-display');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    // Set canvas dimensions based on TARGET_SIZE
    editorCanvas.width = TARGET_SIZE;
    editorCanvas.height = TARGET_SIZE;
    // Set mosaic canvas dimensions to TARGET_SIZE (48x48)
    mosaicCanvas.width = TARGET_SIZE; 
    mosaicCanvas.height = TARGET_SIZE;
    resDisplay.textContent = `${TARGET_SIZE}x${TARGET_SIZE}`;

    let currentEditorColor = [0, 0, 255]; // Default to blue
    let isDrawing = false;
    let finalColorNameMap = null; // Stores the color names for the hover function

    // Pre-calculate RGB values
    const RGB_VALUES = Object.fromEntries(
        Object.entries(COLOURS_DATA).map(([name, data]) => [name, data.rgb])
    );

    // --- Helper Functions ---

    /** Converts hex color to RGB array [R, G, B] */
    function hexToRgb(hex) {
        let r = 0, g = 0, b = 0;
        if (hex.length == 4) {
            r = "0x" + hex[1] + hex[1];
            g = "0x" + hex[2] + hex[2];
            b = "0x" + hex[3] + hex[3];
        } else if (hex.length == 7) {
            r = "0x" + hex[1] + hex[2];
            g = "0x" + hex[3] + hex[4];
            b = "0x" + hex[5] + hex[6];
        }
        return [parseInt(r), parseInt(g), parseInt(b)];
    }

    /** Calculates Euclidean distance between two RGB colors */
    function rgbDistance(rgb1, rgb2) {
        // Simple Euclidean distance for speed
        return Math.sqrt(
            Math.pow(rgb1[0] - rgb2[0], 2) +
            Math.pow(rgb1[1] - rgb2[1], 2) +
            Math.pow(rgb1[2] - rgb2[2], 2)
        );
    }

    /** Loads image, resizes it, and draws it on the editor canvas */
    function loadImage(file) {
        generateButton.disabled = true;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = TARGET_SIZE;
                tempCanvas.height = TARGET_SIZE;
                
                // Resample the image to the target mosaic size (48x48)
                tempCtx.drawImage(img, 0, 0, TARGET_SIZE, TARGET_SIZE);

                // Draw the downscaled image onto the main editor canvas
                editorCtx.drawImage(tempCanvas, 0, 0);
                generateButton.disabled = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    /** Draws a single pixel of the current editor color */
    function drawPixel(e) {
        if (!isDrawing) return;
        const rect = editorCanvas.getBoundingClientRect();
        const scaleX = editorCanvas.width / rect.width;
        const scaleY = editorCanvas.height / rect.height;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);
        
        if (x >= 0 && x < editorCanvas.width && y >= 0 && y < editorCanvas.height) {
            editorCtx.fillStyle = `rgb(${currentEditorColor[0]}, ${currentEditorColor[1]}, ${currentEditorColor[2]})`;
            editorCtx.fillRect(x, y, 1, 1); // Fill one pixel
        }
    }

    // --- Mosaic Generation Logic ---

    function getPixelData() {
        // Get the entire image data array from the *edited* canvas
        const imageData = editorCtx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
        const data = imageData.data;
        
        const pixels = [];
        const importanceScores = [];
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Simple grayscale/luminance importance for sorting priority
            const importance = 0.299 * r + 0.587 * g + 0.114 * b; 
            
            pixels.push([r, g, b]);
            importanceScores.push(importance);
        }
        
        // Sort by importance (highest first) - this prioritizes colours for key features
        const pixelIndices = [...Array(pixels.length).keys()].sort(
            (a, b) => importanceScores[b] - importanceScores[a]
        );
        
        return { pixels, pixelIndices };
    }


    function mapToColours(pixels, pixelIndices) {
        let remainingCounts = JSON.parse(JSON.stringify(ORIGINAL_COUNTS)); // Deep copy inventory
        const numPixels = pixels.length;
        const coreImage = new Array(numPixels).fill(0).map(() => [0, 0, 0]); // Init black
        const coreColorNameMap = new Array(numPixels).fill('Out of Stock');
        
        for (const idx of pixelIndices) {
            const originalColor = pixels[idx];
            
            let bestName = null;
            let minDistance = Infinity;

            // Find the closest available colour
            for (const [name, rgb] of Object.entries(RGB_VALUES)) {
                if (remainingCounts[name] > 0) {
                    const dist = rgbDistance(originalColor, rgb);
                    
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestName = name;
                    }
                }
            }

            if (bestName) {
                // Assign the closest available colour and consume inventory
                coreImage[idx] = RGB_VALUES[bestName];
                coreColorNameMap[idx] = bestName;
                remainingCounts[bestName]--;
            }
        }
        
        // Reshape core image data for map (48x48)
        const coreImageArray = new Uint8ClampedArray(coreImage.flat());
        const coreColorNameMap2D = [];
        for (let i = 0; i < coreColorNameMap.length; i += TARGET_SIZE) {
            coreColorNameMap2D.push(coreColorNameMap.slice(i, i + TARGET_SIZE));
        }

        return { coreImageArray, remainingCounts, coreColorNameMap2D };
    }

    function runGeneration() {
        summaryOutput.innerHTML = "Generating mosaic...";
        generateButton.disabled = true;

        const { pixels, pixelIndices } = getPixelData();
        const { coreImageArray, remainingCounts, coreColorNameMap2D } = mapToColours(pixels, pixelIndices);

        // Create final ImageData (4-channel RGBA) directly from 3-channel (RGB) coreImageArray
        const finalImageData = mosaicCtx.createImageData(TARGET_SIZE, TARGET_SIZE);
        const data = finalImageData.data;

        for (let i = 0; i < TARGET_SIZE * TARGET_SIZE; i++) {
            const srcIdx = i * 3;
            const destIdx = i * 4;
            
            data[destIdx] = coreImageArray[srcIdx];
            data[destIdx + 1] = coreImageArray[srcIdx + 1];
            data[destIdx + 2] = coreImageArray[srcIdx + 2];
            data[destIdx + 3] = 255; // Alpha
        }

        mosaicCtx.putImageData(finalImageData, 0, 0);
        
        // The color map is already 48x48, so assign it directly
        finalColorNameMap = coreColorNameMap2D; 

        generateSummary(remainingCounts);
        generateButton.disabled = false;
    }

    function generateSummary(finalRemaining) {
        let html = '';
        let totalUsed = 0;
        let summaryData = [];

        for (const name in ORIGINAL_COUNTS) {
            const original = ORIGINAL_COUNTS[name];
            const remaining = finalRemaining[name];
            const used = original - remaining;
            totalUsed += used;

            // Only show colors that were used or had remaining inventory
            if (used > 0 || remaining < original) {
                summaryData.push({ name, used, remaining, original });
            }
        }

        html += `
            <div class="py-2 border-b border-gray-200">
                <span class="font-bold text-gray-800">Total PIXELS used: ${totalUsed}</span>
                <span class="text-xs text-gray-500 block">(${TARGET_SIZE * TARGET_SIZE} pixels needed for core image)</span>
            </div>
            <div class="grid grid-cols-4 font-bold text-gray-700 mt-2">
                <div>COLOR</div>
                <div class="text-right">USED| </div>
                <div class="text-right">REMAINING| </div>
                <div class="text-right">ORIGINAL </div>
            </div>
        `;

        summaryData.forEach(item => {
            html += `
                <div class="grid grid-cols-4 mt-1 border-b border-dashed border-gray-100">
                    <div class="truncate">${item.name}</div>
                    <div class="text-right text-red-600">${item.used}</div>
                    <div class="text-right text-green-600">${item.remaining}</div>
                    <div class="text-right">${item.original}</div>
                </div>
            `;
        });
        
        summaryOutput.innerHTML = html;
    }

    // --- Event Listeners ---

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                loadImage(file);
                // Update filename display text
                if (fileNameDisplay) {
                    fileNameDisplay.textContent = file.name;
                    fileNameDisplay.classList.remove("text-gray-500");
                    fileNameDisplay.classList.add("text-indigo-600");
                }
            } else {
                 if (fileNameDisplay) {
                    fileNameDisplay.textContent = "No file chosen";
                    fileNameDisplay.classList.add("text-gray-500");
                    fileNameDisplay.classList.remove("text-indigo-600");
                }
            }
        });
    }

    // Safety check: Only add listener if editorColorPicker exists in HTML
    if (editorColourPicker) {
        editorColourPicker.addEventListener('input', (e) => {
            const hex = e.target.value;
            currentEditorColor = hexToRgb(hex);
            if (currentColourDisplay) {
                currentColourDisplay.textContent = `${hex}`;
            }
        });
    }

    if (editorCanvas) {
        editorCanvas.addEventListener('mousedown', (e) => {
            isDrawing = true;
            drawPixel(e);
        });

        editorCanvas.addEventListener('mousemove', drawPixel);
        editorCanvas.addEventListener('mouseup', () => { isDrawing = false; });
        editorCanvas.addEventListener('mouseleave', () => { isDrawing = false; });
    }

    if (generateButton) {
        generateButton.addEventListener('click', runGeneration);
    }

    if (mosaicCanvas) {
        mosaicCanvas.addEventListener('mousemove', (e) => {
            if (!finalColorNameMap) return;

            const rect = mosaicCanvas.getBoundingClientRect();
            const mapSize = TARGET_SIZE; 
            const scaleX = mapSize / rect.width;
            const scaleY = mapSize / rect.height;

            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);

            if (x >= 0 && x < mapSize && y >= 0 && y < mapSize) {
                if (hoverInfo) {
                    hoverInfo.textContent = ` Colour: ${finalColorNameMap[y][x]}`;
                }
            } else {
                if (hoverInfo) {
                    hoverInfo.textContent = '';
                }
            }
        });
    }
    
    // Initial placeholder drawing
    if (editorCtx) {
        editorCtx.fillStyle = '#f3f4f6';
        editorCtx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
    }
    
    if (summaryOutput) {
        summaryOutput.textContent = "Please upload an image and click 'Run Generation'.";
    }
});
