import React, { useState } from "react";
import {
  AUTH_USERS,
  LS_AUTH_USER_KEY,
} from "../constants/auth.js";

function AuthField({ label, children }) {
  return (
    <div className="field">
      <label className="field-label">
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

export default function AuthScreen({
  onLogin,
  brand,
}) {
  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    const found = AUTH_USERS.find(
      (user) =>
        user.username ===
          username.trim() &&
        user.password === password
    );

    if (!found) {
      setError(
        "Invalid username or password."
      );
      return;
    }

    const sessionUser = {
      username: found.username,
      role: found.role,
      label: found.label,
    };

    localStorage.setItem(
      LS_AUTH_USER_KEY,
      JSON.stringify(sessionUser)
    );

    onLogin(sessionUser);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          {brand?.logoUrl && (
            <img
              className="auth-logo"
              src={brand.logoUrl}
              alt="Themes Furnishings & Decor"
            />
          )}

          <div>
            <div className="auth-title">
              Quotation App Login
            </div>

            <div className="auth-subtitle">
              Themes Furnishings & Decor
            </div>
          </div>
        </div>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <AuthField label="Username">
            <input
              className="input"
              value={username}
              onChange={(e) => {
                setUsername(
                  e.target.value
                );
                setError("");
              }}
              placeholder="admin or staff"
              autoFocus
            />
          </AuthField>

          <AuthField label="Password">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(
                  e.target.value
                );
                setError("");
              }}
              placeholder="Enter password"
            />
          </AuthField>

          <button
            className="btn btn-primary"
            type="submit"
            style={{
              justifyContent:
                "center",
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}