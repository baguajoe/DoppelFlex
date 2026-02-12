import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom'; // Import Link component

const ProfilePage = () => {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/get-saved-sessions/1`)

    .then((res) => res.json())
    .then(setSessions);
}, []);

const handleReplay = (session) => {
  localStorage.setItem('replay_session', JSON.stringify(session));
  window.location.href = '/replay';
};

return (
  <div className="container">
    <h2 className="text-center">👤 Your Saved Sessions</h2>

    {/* Link to Avatar Customization */}
    <div className="text-center mb-4">
      <Link to="/avatar-customization" className="btn btn-secondary">
        Go to Avatar Customization
      </Link>
    </div>

    {sessions.length === 0 ? (
      <p>No sessions saved yet.</p>
    ) : (
      <div className="row">
        {sessions.map((s) => (
          <div key={s.id} className="col-md-4">
            <div className="card mb-3">
              <div className="card-body">
                <h5 className="card-title">Session #{s.id}</h5>
                <p className="card-text">Frames: {s.frames.length}</p>
                <p className="card-text">Saved: {new Date(s.created_at).toLocaleString()}</p>
                <button className="btn btn-primary" onClick={() => handleReplay(s)}>▶ Replay</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
};

export default ProfilePage;
