// src/pages/ClothingMatchPage.js
import React, { useState, useContext } from "react";
import ClothingDetector from "../component/ClothingDetector";
import OutfitSelector from "../component/OutfitSelector";
import { matchOutfitsFromCaption } from "../../../utils/matchOutfits";
import AvatarPreview from "../component/AvatarPreview";
import { Context } from "../store/appContext";

const ClothingMatchPage = () => {
  const [caption, setCaption] = useState("");
  const [matchedOutfits, setMatchedOutfits] = useState([]);
  const [selectedOutfit, setSelectedOutfit] = useState(null);
  const [customStyle, setCustomStyle] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const { store } = useContext(Context);

  const handleCaptionReady = (detectedCaption) => {
    setCaption(detectedCaption);
    const matches = matchOutfitsFromCaption(detectedCaption);
    setMatchedOutfits(matches);
  };

  const handleCustomStyleSubmit = () => {
    const matches = matchOutfitsFromCaption(customStyle);
    setCaption(customStyle);
    setMatchedOutfits(matches);
  };

  const handleSaveOutfit = async () => {
    if (!selectedOutfit || !store.token) {
      setSaveStatus("❌ You must be logged in to save an outfit.");
      return;
    }

    try {
      const response = await fetch(`${process.env.BACKEND_URL}/api/save-outfit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${store.token}`,
        },
        body: JSON.stringify({
          name: selectedOutfit.name,
          file: selectedOutfit.file,
          style: caption,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setSaveStatus("✅ Outfit saved to your profile!");
      } else {
        setSaveStatus(`❌ Error: ${data.message || "Could not save outfit."}`);
      }
    } catch (err) {
      console.error(err);
      setSaveStatus("❌ Failed to connect to server.");
    }
  };

  return (
    <div className="container mt-4">
      <h2>🧠 AI Clothing Style Matcher</h2>
      <p>Upload an image, and we’ll detect the clothing style and suggest matching 3D outfits.</p>

      <ClothingDetector onCaptionReady={handleCaptionReady} />

      <div className="mt-4">
        <label htmlFor="customStyle">Or describe a style manually:</label>
        <div className="input-group mb-3">
          <input
            type="text"
            className="form-control"
            placeholder="e.g. futuristic armor with glowing lights"
            value={customStyle}
            onChange={(e) => setCustomStyle(e.target.value)}
          />
          <button className="btn btn-outline-secondary" onClick={handleCustomStyleSubmit}>
            Match Style
          </button>
        </div>
      </div>

      {caption && (
        <div className="mt-4">
          <h5>Detected Style:</h5>
          <p><strong>{caption}</strong></p>
        </div>
      )}

      {matchedOutfits.length > 0 && (
        <>
          <h5 className="mt-4">🎽 Matching 3D Outfits:</h5>
          <OutfitSelector matchedOutfits={matchedOutfits} onSelect={setSelectedOutfit} />
        </>
      )}

      {selectedOutfit && (
        <div className="mt-4">
          <h5>✅ Selected Outfit: {selectedOutfit.name}</h5>
          <p>Load file: <code>{selectedOutfit.file}</code> onto your avatar.</p>
          <AvatarPreview outfitFile={selectedOutfit.file} />

          <button className="btn btn-success mt-3" onClick={handleSaveOutfit}>
            💾 Save to My Profile
          </button>
          {saveStatus && <p className="mt-2">{saveStatus}</p>}
        </div>
      )}
    </div>
  );
};

export default ClothingMatchPage;