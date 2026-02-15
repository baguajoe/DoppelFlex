// src/front/js/component/BodyCustomizer.js
// Body type presets + fine-tuning sliders
// Outputs proportions that drive both 2D puppet and 3D avatar

import React, { useState, useEffect, useCallback } from "react";
import {
  DEFAULT_PROPORTIONS,
  BODY_PRESETS,
  BODY_SLIDERS,
} from "../utils/bodyPresets";
import "../../styles/BodyCustomizer.css";

const BodyCustomizer = ({ onProportionsChange, initialProportions, initialPreset }) => {
  const [activePreset, setActivePreset] = useState(initialPreset || "average");
  const [proportions, setProportions] = useState(
    initialProportions || { ...DEFAULT_PROPORTIONS }
  );
  const [expandedGroups, setExpandedGroups] = useState({
    Overall: true,
    "Upper Body": false,
    Arms: false,
    "Lower Body": false,
    Head: false,
  });

  // Notify parent of changes
  useEffect(() => {
    if (onProportionsChange) {
      onProportionsChange(proportions, activePreset);
    }
  }, [proportions, activePreset, onProportionsChange]);

  // Apply a preset
  const applyPreset = useCallback((presetKey) => {
    const preset = BODY_PRESETS[presetKey];
    if (!preset) return;
    setActivePreset(presetKey);
    setProportions({ ...preset.proportions });
  }, []);

  // Update a single slider
  const updateSlider = useCallback((key, value) => {
    setActivePreset(null); // Clear preset highlight since user is customizing
    setProportions((prev) => ({ ...prev, [key]: parseFloat(value) }));
  }, []);

  // Reset to default
  const handleReset = () => {
    setActivePreset("average");
    setProportions({ ...DEFAULT_PROPORTIONS });
  };

  // Randomize
  const handleRandomize = () => {
    setActivePreset(null);
    const randomized = {};
    Object.keys(DEFAULT_PROPORTIONS).forEach((key) => {
      randomized[key] = Math.random() * 0.7 + 0.15; // Keep in 0.15-0.85 range
    });
    setProportions(randomized);
  };

  // Toggle slider group
  const toggleGroup = (group) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  // Group sliders by category
  const groupedSliders = BODY_SLIDERS.reduce((acc, slider) => {
    if (!acc[slider.group]) acc[slider.group] = [];
    acc[slider.group].push(slider);
    return acc;
  }, {});

  return (
    <div className="body-customizer">
      {/* Preset Cards */}
      <div className="bc-presets">
        <div className="bc-presets-header">
          <h6 className="bc-section-title">Body Type</h6>
          <div className="bc-actions">
            <button className="bc-action-btn" onClick={handleRandomize} title="Randomize">
              🎲
            </button>
            <button className="bc-action-btn" onClick={handleReset} title="Reset">
              ↺
            </button>
          </div>
        </div>

        <div className="bc-preset-grid">
          {Object.entries(BODY_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              className={`bc-preset-card ${activePreset === key ? "bc-preset-card--active" : ""}`}
              onClick={() => applyPreset(key)}
            >
              <span className="bc-preset-emoji">{preset.emoji}</span>
              <span className="bc-preset-label">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fine-Tuning Sliders */}
      <div className="bc-sliders">
        <h6 className="bc-section-title">Fine-Tune</h6>

        {Object.entries(groupedSliders).map(([group, sliders]) => (
          <div key={group} className="bc-slider-group">
            <button
              className={`bc-group-header ${expandedGroups[group] ? "bc-group-header--open" : ""}`}
              onClick={() => toggleGroup(group)}
            >
              <span>{group}</span>
              <svg
                className={`bc-chevron ${expandedGroups[group] ? "bc-chevron--open" : ""}`}
                width="12" height="12" viewBox="0 0 12 12"
              >
                <path
                  d="M2.5 4.5l3.5 3.5 3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>

            {expandedGroups[group] && (
              <div className="bc-slider-list">
                {sliders.map((slider) => (
                  <div key={slider.key} className="bc-slider-row">
                    <div className="bc-slider-label-row">
                      <label className="bc-slider-label">{slider.label}</label>
                      <span className="bc-slider-value">
                        {(proportions[slider.key] * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="bc-slider-track-row">
                      <span className="bc-slider-min">{slider.min}</span>
                      <input
                        type="range"
                        className="bc-slider"
                        min="0"
                        max="1"
                        step="0.01"
                        value={proportions[slider.key]}
                        onChange={(e) => updateSlider(slider.key, e.target.value)}
                      />
                      <span className="bc-slider-max">{slider.max}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Custom preset indicator */}
      {!activePreset && (
        <div className="bc-custom-indicator">
          Custom body type
        </div>
      )}
    </div>
  );
};

export default BodyCustomizer;