import { useState, useRef } from "react";
import jsPDF from "jspdf";
import Papa from "papaparse";
import JSZip from "jszip";
import "./App.css";

function App() {
  const [file, setFile] = useState<string | null>(null);
  const [text, setText] = useState("Your Text");
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState("#ffffff");

  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);

  // NEW: Batch processing state
  const [batchMode, setBatchMode] = useState(false);
  const [namesList, setNamesList] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  const offset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setFile(URL.createObjectURL(e.target.files[0]));
    } else {
      setFile(null);
    }
  }

  // NEW: Handle CSV upload
  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      Papa.parse(file, {
        complete: (results) => {
          // Extract names from first column, skip header
          const names = results.data
            .slice(1)
            .map((row: any) => row[0])
            .filter((name: string) => name && name.trim());
          setNamesList(names);
          setBatchMode(true);
          setText(names.join(", "));
        },
        header: false,
      });
    }
  }

  // NEW: Handle comma-separated names
  function handleNamesInput(value: string) {
    setText(value);
    if (value.includes(",")) {
      const names = value.split(",").map((n) => n.trim()).filter((n) => n);
      setNamesList(names);
      setBatchMode(names.length > 1);
    } else {
      setBatchMode(false);
      setNamesList([]);
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    setDragging(true);
    offset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;

    const container = containerRef.current;
    const textBox = textRef.current;
    if (!container || !textBox) return;

    const containerRect = container.getBoundingClientRect();
    const textRect = textBox.getBoundingClientRect();

    let newX = e.clientX - offset.current.x;
    let newY = e.clientY - offset.current.y;

    const minX = 0;
    const minY = 0;
    const maxX = containerRect.width - textRect.width;
    const maxY = containerRect.height - textRect.height;

    newX = Math.max(minX, Math.min(newX, maxX));
    newY = Math.max(minY, Math.min(newY, maxY));

    setPosition({ x: newX, y: newY });
  }

  function handleMouseUp() {
    setDragging(false);
  }

  // Helper to create high-quality canvas with custom text
  async function createHighQualityCanvas(customText?: string) {
    if (!file) return null;

    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        // Use original image dimensions
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw original image at full resolution
        ctx.drawImage(img, 0, 0);

        // Calculate scale factor (original vs displayed)
        const container = containerRef.current;
        if (!container) {
          reject(new Error("Container not found"));
          return;
        }
        const containerRect = container.getBoundingClientRect();
        const displayedWidth = containerRect.width;
        const scale = img.width / displayedWidth;

        // Draw text at scaled position and size
        const textToRender = customText || text;
        ctx.font = `bold ${fontSize * scale}px Arial`;
        ctx.fillStyle = color;
        ctx.shadowColor = "black";
        ctx.shadowBlur = 5 * scale;
        ctx.fillText(textToRender, position.x * scale, (position.y + fontSize) * scale);

        resolve(canvas);
      };
      img.onerror = reject;
      img.src = file;
    });
  }

  // 🎉 EXPORT AS PNG (Single or Batch)
  async function downloadPNG() {
    if (batchMode && namesList.length > 1) {
      await downloadBatchPNG();
    } else {
      const canvas = await createHighQualityCanvas();
      if (!canvas) return;

      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataURL;
      link.download = "edited-image.png";
      link.click();
    }
  }

  // 🎉 EXPORT AS PDF (Single or Batch)
  async function downloadPDF() {
    if (batchMode && namesList.length > 1) {
      await downloadBatchPDF();
    } else {
      const canvas = await createHighQualityCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL("image/png");

      // Determine orientation based on actual image dimensions
      const orientation = canvas.width > canvas.height ? "landscape" : "portrait";

      const pdf = new jsPDF({
        orientation: orientation,
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save("edited-image.pdf");
    }
  }

  // NEW: Download all certificates as PNG in a ZIP file
  async function downloadBatchPNG() {
    setProcessing(true);
    const zip = new JSZip();

    for (let i = 0; i < namesList.length; i++) {
      const name = namesList[i];
      const canvas = await createHighQualityCanvas(name);
      if (!canvas) continue;

      const dataURL = canvas.toDataURL("image/png");
      const base64Data = dataURL.split(",")[1];
      zip.file(`certificate_${name.replace(/\s+/g, "_")}.png`, base64Data, {
        base64: true,
      });
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "certificates.zip";
    link.click();
    setProcessing(false);
  }

  // NEW: Download all certificates as PDF in a ZIP file
  async function downloadBatchPDF() {
    setProcessing(true);
    const zip = new JSZip();

    for (let i = 0; i < namesList.length; i++) {
      const name = namesList[i];
      const canvas = await createHighQualityCanvas(name);
      if (!canvas) continue;

      const imgData = canvas.toDataURL("image/png");
      const orientation = canvas.width > canvas.height ? "landscape" : "portrait";

      const pdf = new jsPDF({
        orientation: orientation,
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      const pdfBlob = pdf.output("blob");
      zip.file(`certificate_${name.replace(/\s+/g, "_")}.pdf`, pdfBlob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "certificates.zip";
    link.click();
    setProcessing(false);
  }

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Certificate Generator</h1>
      
      <h2>Upload Image</h2>
      <input type="file" onChange={handleChange} accept="image/*" />

      <h2>Add Text (or Names separated by comma)</h2>
      <input
        type="text"
        value={text}
        onChange={(e) => handleNamesInput(e.target.value)}
        placeholder="e.g., John, Ali, Sarah"
        style={{ width: "300px", padding: "8px" }}
      />

      <h2>Or Upload CSV File (names in first column)</h2>
      <input type="file" onChange={handleCSVUpload} accept=".csv" />

      {batchMode && namesList.length > 1 && (
        <div style={{ margin: "10px 0", padding: "10px", background: "#e3f2fd", borderRadius: "5px", maxWidth: "500px" }}>
          <strong>Batch Mode Active:</strong> {namesList.length} certificates will be generated
          <div style={{ marginTop: "5px", fontSize: "14px" }}>
            Names: {namesList.join(", ")}
          </div>
        </div>
      )}

      <h2>Font Size</h2>
      <input
        type="range"
        min="10"
        max="80"
        value={fontSize}
        onChange={(e) => setFontSize(Number(e.target.value))}
      />
      <span style={{ marginLeft: "10px" }}>{fontSize}px</span>

      <h2>Font Color</h2>
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />

      <div style={{ marginTop: "20px" }}>
        <button 
          onClick={downloadPNG} 
          style={{ marginRight: "10px", padding: "10px 20px", cursor: processing ? "not-allowed" : "pointer" }} 
          disabled={processing}
        >
          {processing ? "Processing..." : batchMode && namesList.length > 1 ? "Download All PNG (ZIP)" : "Download PNG"}
        </button>

        <button 
          onClick={downloadPDF} 
          style={{ padding: "10px 20px", cursor: processing ? "not-allowed" : "pointer" }}
          disabled={processing}
        >
          {processing ? "Processing..." : batchMode && namesList.length > 1 ? "Download All PDF (ZIP)" : "Download PDF"}
        </button>
      </div>

      {/* Image + text container */}
      <div
        ref={exportRef}
        style={{
          position: "relative",
          marginTop: "20px",
          display: "inline-block",
        }}
      >
        {/* Drag area */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ position: "relative" }}
        >
          {file && (
            <>
              <img
                src={file}
                alt="Preview"
                style={{ width: "500px", borderRadius: "8px", display: "block" }}
              />

              <div
                ref={textRef}
                onMouseDown={handleMouseDown}
                style={{
                  position: "absolute",
                  top: position.y,
                  left: position.x,
                  color: color,
                  fontSize: fontSize,
                  fontWeight: "bold",
                  textShadow: "0px 0px 5px black",
                  cursor: "grab",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {batchMode && namesList.length > 0 ? namesList[0] : text}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;