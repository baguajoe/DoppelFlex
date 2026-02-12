// src/front/js/pages/MyOutfitsPage.js
import React, { useEffect, useState, useContext } from "react";
import { Context } from "../store/appContext";
import AvatarPreview from "../component/AvatarPreview";
import { useNavigate } from "react-router-dom";

const MyOutfitsPage = () => {
    const { store } = useContext(Context);
    const [outfits, setOutfits] = useState([]);
    const [selectedOutfit, setSelectedOutfit] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
      const fetchOutfits = async () => {
        if (!store.token) {
          setError("❌ You must be logged in to view outfits.");
          setLoading(false);
          return;
        }

        try {
          const res = await fetch(`${process.env.BACKEND_URL}/api/my-outfits`, {
            headers: {
              Authorization: `Bearer ${store.token}`,
            },
          });

          if (!res.ok) throw new Error("Failed to fetch outfits.");
          const data = await res.json();
          setOutfits(data.outfits || []);
        } catch (err) {
          console.error(err);
          setError("❌ Unable to load outfits.");
        }

        setLoading(false);
      };

      fetchOutfits();
    }, [store.token]);

    const handleDownload = (outfit) => {
      const link = document.createElement("a");
      link.href = `${process.env.BACKEND_URL}/static/outfits/${outfit.file}`;
      link.download = outfit.file;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const handleFavorite = async (outfitId) => {
      try {
        const res = await fetch(`${process.env.BACKEND_URL}/api/favorite-outfit/${outfitId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${store.token}`,
          },
        });

        if (!res.ok) throw new Error("Failed to favorite outfit.");
        alert("⭐ Outfit favorited!");
      } catch (err) {
        console.error("Favorite failed:", err);
        alert("Failed to favorite outfit.");
      }
    };

    const handleExportCombined = async (outfitFile) => {
      try {
        const res = await fetch(`${process.env.BACKEND_URL}/export-combined-avatar`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${store.token}`,
          },
          body: JSON.stringify({
            avatar_id: store.userAvatarId, // replace with actual avatar ID logic
            outfit_file: outfitFile,
          }),
        });

        if (!res.ok) throw new Error("Export failed");

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "combined_avatar.glb";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (err) {
        console.error("Export error:", err);
        alert("Failed to export combined avatar.");
      }
    };

    return (
      <div className="container mt-4">
        <h2>🧍‍♂️ My Saved Outfits</h2>

        {loading && <p>Loading outfits...</p>}
        {error && <p className="text-danger">{error}</p>}

        {!loading && !error && outfits.length === 0 && (
          <p>No outfits saved yet.</p>
        )}

        <div className="row">
          {outfits.map((outfit, index) => (
            <div key={index} className="col-md-4 mb-3">
              <div className="card h-100">
                <div className="card-body">
                  <h5 className="card-title">{outfit.name}</h5>
                  <p className="card-text text-muted">Style: {outfit.style}</p>
                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => setSelectedOutfit(outfit)}
                    >
                      Preview
                    </button>

                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => handleDownload(outfit)}
                    >
                      Download
                    </button>

                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => navigate(`/rig?outfit=${encodeURIComponent(outfit.file)}`)}
                    >
                      Rig Preview
                    </button>

                    <button
                      className="btn btn-sm btn-dark"
                      onClick={() => handleExportCombined(outfit.file)}
                    >
                      Export Avatar + Outfit
                    </button>

                    <button
                      className="btn btn-sm btn-warning"
                      onClick={() => handleFavorite(outfit.id)}
                    >
                      ⭐ Favorite
                    </button>

                    <button
                      className="btn btn-sm btn-danger"
                      onClick={async () => {
                        const res = await fetch(`${process.env.BACKEND_URL}/api/delete-outfit/${outfit.id}`, {
                          method: "DELETE",
                          headers: {
                            Authorization: `Bearer ${store.token}`,
                          },
                        });

                        if (res.ok) {
                          setOutfits(outfits.filter((o) => o.id !== outfit.id));
                        } else {
                          alert("Failed to delete outfit.");
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {selectedOutfit && (
          <div className="mt-5">
            <h4>👕 Previewing: {selectedOutfit.name}</h4>
            <AvatarPreview outfitFile={selectedOutfit.file} />
          </div>
        )}
      </div>
    );
};

export default MyOutfitsPage;