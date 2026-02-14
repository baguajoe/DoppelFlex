// src/front/js/layout.js
// Fixed: DoppelFlex footer, dark background, removed hardcoded userId, proper component imports

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './component/sidebar';
import Navbar from './component/navbar';
import injectContext from './store/appContext';

import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import CustomizePage from './pages/CustomizePage';
import RigAvatarPage from './pages/RigAvatarPage';
import MotionCapturePage from './pages/MotionCapturePage';
import ProfilePage from './pages/ProfilePage';
import ErrorPage from './pages/ErrorPage';
import MotionFromVideoPage from './pages/MotionFromVideoPage';
import DanceSyncPage from './pages/DanceSyncPage';
import AvatarWithPosePage from './pages/AvatarWithPosePage';
import AvatarViewPage from './pages/AvatarViewPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import BeatEditorPage from './pages/BeatEditorPage';
import BeatMapEditorPage from './pages/BeatMapEditorPage';
import MotionSessionList from './pages/MotionSessionList';
import ReplayMotionSession from './pages/ReplayMotionSession';
import StripePricingPage from './pages/StripePricingPage';
import VideoUploadPage from './pages/VideoUploadPage';
import AvatarExportPage from './pages/AvatarExportPage';
import AvatarCustomizationPage from './pages/AvatarCustomizationPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import ClothingMatchPage from './pages/ClothingMatchPage';
import MyOutfitsPage from './pages/MyOutfitsPage';
import FaceCapturePage from './pages/FaceCapturePage';
import FullBodyCapturePage from './pages/FullBodyCapturePage';
import IllustrationTo3DPage from './pages/IllustrationTo3DPage';
import Live2DAvatarPage from './pages/Live2DAvatarPage';


const Layout = () => {
  return (
    <BrowserRouter>
      <div style={{ background: '#0d0d14', minHeight: '100vh', color: '#e0e0e0' }}>
        <Navbar />
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main style={{ flex: 1, padding: '20px', minHeight: 'calc(100vh - 56px)', overflow: 'auto' }}>
            <Routes>
              {/* Core */}
              <Route path="/" element={<HomePage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/customize" element={<CustomizePage />} />
              <Route path="/rig" element={<RigAvatarPage />} />
              <Route path="/avatar-view" element={<AvatarViewPage />} />
              <Route path="/export-avatar" element={<AvatarExportPage />} />
              <Route path="/illustration-to-3d" element={<IllustrationTo3DPage />} />

              {/* Motion Capture */}
              <Route path="/motion" element={<MotionCapturePage />} />
              <Route path="/face-capture" element={<FaceCapturePage />} />
              <Route path="/full-capture" element={<FullBodyCapturePage />} />
              <Route path="/2d-avatar" element={<Live2DAvatarPage />} />
              <Route path="/motion-from-video" element={<MotionFromVideoPage />} />
              <Route path="/motion-sessions" element={<MotionSessionList />} />
              <Route path="/replay-session/:sessionId" element={<ReplayMotionSession />} />
              <Route path="/video-upload" element={<VideoUploadPage />} />

              {/* Music & Dance */}
              <Route path="/dance-sync" element={<DanceSyncPage />} />
              <Route path="/beat-editor" element={<BeatEditorPage />} />
              <Route path="/beatmap-editor" element={<BeatMapEditorPage />} />

              {/* Wardrobe */}
              <Route path="/clothing-match" element={<ClothingMatchPage />} />
              <Route path="/my-outfits" element={<MyOutfitsPage />} />

              {/* Account */}
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/avatar-customization" element={<AvatarCustomizationPage />} />
              <Route path="/account-settings" element={<AccountSettingsPage />} />
              <Route path="/stripe-pricing" element={<StripePricingPage />} />

              {/* Auth */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />

              {/* Legacy */}
              <Route path="/avatar-with-pose" element={<AvatarWithPosePage />} />

              {/* 404 */}
              <Route path="*" element={<ErrorPage />} />
            </Routes>

            {/* Footer */}
            <footer style={{
              textAlign: 'center',
              borderTop: '1px solid #1a1a2e',
              padding: '16px 0 8px',
              marginTop: '40px',
              fontSize: '12px',
              color: '#555',
            }}>
              <span style={{
                background: 'linear-gradient(135deg, #a78bfa, #6366f1)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontWeight: 700,
              }}>
                DoppelFlex
              </span>
              {' '}© {new Date().getFullYear()} — Browser-based motion capture for creators
            </footer>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
};

export default injectContext(Layout)