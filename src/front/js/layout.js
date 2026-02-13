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
import MotionSessionList from './pages/MotionSessionList.js';
import ReplayMotionSession from './pages/ReplayMotionSession.js';
import StripePricingPage from './pages/StripePricingPage.js';
import VideoUploadPage from './pages/VideoUploadPage.js';
import AvatarExportPage from './pages/AvatarExportPage.js';
import AvatarCustomizationPage from './pages/AvatarCustomizationPage';
import AccountSettingsPage from "./pages/AccountSettingsPage";
import ClothingMatchPage from './pages/ClothingMatchPage';
import MyOutfitsPage from "./pages/MyOutfitsPage";
import FullBodyCapturePage from './pages/FullBodyCapturePage';
import demo from './pages/demo.js';
import single from './pages/single.js';

const Layout = () => {
  return (
    <BrowserRouter>
   
        <Navbar />
        <div className="d-flex">
          <Sidebar />
          <div className="flex-grow-1 p-4">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/customize" element={<CustomizePage />} />
              <Route path="/rig" element={<RigAvatarPage />} />
              <Route path="/clothing-match" element={<ClothingMatchPage />} />
              <Route path="/motion" element={<MotionCapturePage />} />
              <Route path="/motion-from-video" element={<MotionFromVideoPage />} />
              <Route path="/profile" element={<ProfilePage userId={1} />} />
              <Route path="/dance-sync" element={<DanceSyncPage />} />
              <Route path="/avatar-with-pose" element={<AvatarWithPosePage />} />
              <Route path="/avatar-view" element={<AvatarViewPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/beat-editor" element={<BeatEditorPage />} />
              <Route path="/beatmap-editor" element={<BeatMapEditorPage />} />
              <Route path="/motion-sessions" element={<MotionSessionList />} />
              <Route path="/replay-session/:sessionId" element={<ReplayMotionSession />} />
              <Route path="/stripe-pricing" element={<StripePricingPage />} />
              <Route path="/video-upload" element={<VideoUploadPage />} />
              <Route path="/avatar-customization" element={<AvatarCustomizationPage />} />
              <Route path="/account-settings" element={<AccountSettingsPage />} />
              <Route path="/my-outfits" element={<MyOutfitsPage />} />
              <Route path="/full-capture" element={<FullBodyCapturePage />} />
              <Route path="/demo" element={<demo />} />
              <Route path="/single" element={<single />} />
              <Route path="*" element={<ErrorPage />} />
              <Route path="/export-avatar" element={<AvatarExportPage />} />
            </Routes>
            <footer className="text-center mt-5 border-top pt-3">
              <p>© {new Date().getFullYear()} Avatar Creator</p>
            </footer>
          </div>
        </div>

    </BrowserRouter>
  );
};

export default injectContext(Layout);
