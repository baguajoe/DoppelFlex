import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SelectBodyTemplatePage = () => {
  const [bodyTemplates, setBodyTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [headPath, setHeadPath] = useState(""); // This should be passed or pulled from context/storage
  const [userId, setUserId] = useState(1); // Replace with auth state if needed
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Replace with real fetch if you want to load templates dynamically
    const templates = [
      { name: "slim.glb", preview: "/static/thumbnails/slim.png" },
      { name: "plus.glb", preview: "/static/thumbnails/plus.png" },
      { name: "hero.glb", preview: "/static/thumbnails/hero.png" }
    ];
    setBodyTemplates(templates);

    // You should retrieve this from localStorage or context
    const storedHead = localStorage.getItem("latest_head_path");
    if (storedHead) setHeadPath(storedHead);
  }, []);

  const handleMerge = async () => {
    if (!selectedTemplate || !headPath) return alert("Select a body and ensure head is uploaded");

    setLoading(true);
    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/merge-avatar-body`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        head_path: headPath,
        body_template: selectedTemplate,
        user_id: userId
      })
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      alert("Merged avatar created!");
      localStorage.setItem("latest_avatar_url", data.avatar_url);
      navigate("/avatar-view"); // Or wherever you want to show it
    } else {
      alert("Merge failed: " + data.error);
    }
  };

  return (
    <div className="container">
      <h2 className="text-center">🧍 Select a Body Template</h2>

      <div className="row">
        {bodyTemplates.map((template) => (
          <div className="col-md-4 mb-3" key={template.name}>
            <div
              className={`card ${selectedTemplate === template.name ? "border-primary" : ""}`}
              onClick={() => setSelectedTemplate(template.name)}
              style={{ cursor: "pointer" }}
            >
              <img
                src={template.preview}
                alt={template.name}
                className="card-img-top"
                style={{ height: "250px", objectFit: "cover" }}
              />
              <div className="card-body text-center">
                <h5 className="card-title">{template.name.replace(".glb", "")}</h5>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-4">
        <button
          className="btn btn-success"
          onClick={handleMerge}
          disabled={!selectedTemplate || loading}
        >
          {loading ? "Merging..." : "✅ Merge with Head"}
        </button>
      </div>
    </div>
  );
};

export default SelectBodyTemplatePage;
