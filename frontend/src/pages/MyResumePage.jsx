// src/pages/MyResumesPage.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import {
  fetchMyResumes,
  uploadResumeFile,
  deleteResumeVersion,
  fetchResumeContent,
  updateResumeContent,
} from "../api/resumes";

function formatDate(d) {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyResumesPage() {
  const { user } = useAuth();

  const [resumes, setResumes] = useState([]);
  const [limits, setLimits] = useState({
    maxResumes: 3,
    maxVersionsPerResume: 5,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [expandedResumeId, setExpandedResumeId] = useState(null);
  const [selectedResumeId, setSelectedResumeId] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [createMode, setCreateMode] = useState("new"); // "new" | "existing"
  const [trackTitle, setTrackTitle] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [modalError, setModalError] = useState("");

  // Edit content mode
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [editingContent, setEditingContent] = useState("");
  const [savingContent, setSavingContent] = useState(false);
  const [contentError, setContentError] = useState("");
  const [hasContentChanged, setHasContentChanged] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [newVersionLabel, setNewVersionLabel] = useState("");
  const [savingAsVersion, setSavingAsVersion] = useState(false);
  const [versionModalError, setVersionModalError] = useState("");

  const hasMaxResumes = resumes.length >= limits.maxResumes;

  const loadMyResumes = async () => {
    try {
      setLoading(true);
      const { data } = await fetchMyResumes();
      setResumes(data.resumes || []);
      if (data.limits) {
        setLimits((prev) => ({ ...prev, ...data.limits }));
      }
      setError("");

      // keep selection somewhat stable
      if (data.resumes && data.resumes.length > 0) {
        const first = data.resumes[0];
        setSelectedResumeId((prev) => prev ?? first.resume_id);
        setExpandedResumeId((prev) => prev ?? first.resume_id);

        if (first.versions && first.versions.length > 0) {
          setSelectedVersion((prev) => prev ?? first.versions[0]);
        }
      } else {
        setSelectedResumeId(null);
        setSelectedVersion(null);
        setExpandedResumeId(null);
      }
    } catch (e) {
      console.error("fetchMyResumes error:", e);
      setError(
        e.response?.data?.message ||
          `Failed to load resumes: ${e.message || "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyResumes();
  }, []);

  const handleToggleResume = (resumeId) => {
    setExpandedResumeId((prev) => (prev === resumeId ? null : resumeId));
  };

  const handleSelectVersion = (resumeId, version) => {
    console.log("Selected version:", version);
    setSelectedResumeId(resumeId);
    setSelectedVersion(version);
    // Set the content from the version
    setEditingContent(version.content || "");
    setHasContentChanged(false);
  };

  const resetModal = () => {
    setCreateMode("new");
    setTrackTitle("");
    setSelectedTrackId(null);
    setVersionLabel("");
    setFile(null);
    setModalError("");
  };

  const handleOpenModal = () => {
    resetModal();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) {
      setFile(null);
      return;
    }

    const name = f.name.toLowerCase();
    const isAllowed =
      name.endsWith(".doc") ||
      name.endsWith(".docx") ||
      name.endsWith(".txt");

    if (!isAllowed) {
      setModalError("Only .doc, .docx, or .txt files are allowed.");
      setFile(null);
      return;
    }

    setModalError("");
    setFile(f);
  };

  const handleSubmitUpload = async () => {
    if (!file) {
      setModalError("Please choose a resume file.");
      return;
    }

    const isNew = createMode === "new";

    if (isNew) {
      if (!trackTitle.trim()) {
        setModalError("Please enter a resume track title.");
        return;
      }
      if (hasMaxResumes) {
        setModalError(
          `You already have the maximum of ${limits.maxResumes} resume tracks.`
        );
        return;
      }
    } else {
      if (!selectedTrackId) {
        setModalError("Please choose an existing track.");
        return;
      }
      // optional: frontend check for version count
      const track = resumes.find((r) => r.resume_id === selectedTrackId);
      if (
        track &&
        track.versions &&
        track.versions.length >= limits.maxVersionsPerResume
      ) {
        setModalError(
          `This track already has ${limits.maxVersionsPerResume} versions. Delete one before adding a new one.`
        );
        return;
      }
    }

    try {
      setUploading(true);
      setModalError("");

      const fd = new FormData();
      fd.append("mode", createMode); // "new" | "existing"
      if (createMode === "new") {
        fd.append("trackTitle", trackTitle.trim());
      } else {
        fd.append("resumeId", String(selectedTrackId));
      }
      if (versionLabel.trim()) {
        fd.append("versionLabel", versionLabel.trim());
      }
      fd.append("file", file);

      await uploadResumeFile(fd);

      setShowModal(false);
      resetModal();
      await loadMyResumes();
    } catch (e) {
      console.error("uploadResumeFile error:", e);
      setModalError(
        e.response?.data?.message ||
          e.message ||
          "Error uploading resume. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteVersion = async (version) => {
    if (!window.confirm("Delete this version? This cannot be undone.")) {
      return;
    }

    try {
      await deleteResumeVersion(version.resume_versions_id);
      // If the deleted version was selected, clear selection
      if (
        selectedVersion &&
        selectedVersion.resume_versions_id === version.resume_versions_id
      ) {
        setSelectedVersion(null);
      }
      await loadMyResumes();
    } catch (e) {
      console.error("deleteResumeVersion error:", e);
      alert(
        e.response?.data?.message ||
          e.message ||
          "Error deleting resume version."
      );
    }
  };

  const handleEditContent = async () => {
    if (!selectedVersion) return;
    setIsEditingContent(true);
    setContentLoading(true);
    setContentError("");
    try {
      const { data } = await fetchResumeContent(selectedVersion.resume_versions_id);
      setEditingContent(data.content || "");
    } catch (err) {
      console.error("Error fetching content:", err);
      setContentError(err.response?.data?.message || "Error loading content");
    } finally {
      setContentLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingContent(false);
    setEditingContent("");
    setContentError("");
  };

  const handleSaveContent = async () => {
    if (!selectedVersion) return;
    setSavingContent(true);
    setContentError("");
    try {
      await updateResumeContent(selectedVersion.resume_versions_id, editingContent);
      // Update the local state
      if (selectedVersion) {
        setSelectedVersion({
          ...selectedVersion,
          content: editingContent,
        });
      }
      setIsEditingContent(false);
      setEditingContent("");
    } catch (err) {
      console.error("Error saving content:", err);
      setContentError(err.response?.data?.message || "Error saving content");
    } finally {
      setSavingContent(false);
    }
  };

  const handleSaveAsVersion = async () => {
    if (!newVersionLabel.trim()) {
      setVersionModalError("Please enter a version name");
      return;
    }

    setSavingAsVersion(true);
    setVersionModalError("");
    try {
      const formData = new FormData();
      formData.append("mode", "existing");
      formData.append("resumeId", String(selectedResumeId));
      formData.append("versionLabel", newVersionLabel.trim());
      
      // Create a text file from the content
      const blob = new Blob([editingContent], { type: "text/plain" });
      const file = new File([blob], "resume_content.txt", { type: "text/plain" });
      formData.append("file", file);

      await uploadResumeFile(formData);

      setShowVersionModal(false);
      setNewVersionLabel("");
      setHasContentChanged(false);
      await loadMyResumes();
    } catch (err) {
      console.error("Error saving as version:", err);
      setVersionModalError(err.response?.data?.message || "Error saving version");
    } finally {
      setSavingAsVersion(false);
    }
  };

  const handleContentChange = (newContent) => {
    setEditingContent(newContent);
    setHasContentChanged(newContent !== selectedVersion?.content);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            My Resumes
          </h1>
          <p className="text-sm text-slate-600">
            Organize up to {limits.maxResumes} tracks (e.g. Software
            Engineering, Consulting), with up to{" "}
            {limits.maxVersionsPerResume} versions per track.
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          disabled={hasMaxResumes && resumes.length === limits.maxResumes}
          className="self-start md:self-auto text-xs px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-60"
        >
          New resume / version
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
        {/* LEFT: tracks + versions */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Resume tracks
          </h2>

          {error && (
            <p className="text-sm text-red-600 mb-2">{error}</p>
          )}
          {loading && (
            <p className="text-sm text-slate-500">
              Loading your resumes…
            </p>
          )}
          {!loading && !error && resumes.length === 0 && (
            <p className="text-sm text-slate-500">
              You haven&apos;t uploaded any resumes yet. Use &quot;New
              resume / version&quot; to get started.
            </p>
          )}

          <div className="space-y-3">
            {resumes.map((r) => (
              <ResumeTrackCard
                key={r.resume_id}
                resume={r}
                expanded={expandedResumeId === r.resume_id}
                onToggle={() => handleToggleResume(r.resume_id)}
                selectedVersion={selectedVersion}
                onSelectVersion={(version) =>
                  handleSelectVersion(r.resume_id, version)
                }
                limits={limits}
                onDeleteVersion={handleDeleteVersion}
              />
            ))}
          </div>
        </section>

        {/* RIGHT: selected version preview with editable content */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-h-[260px] flex flex-col">
          {!selectedVersion ? (
            <p className="text-sm text-slate-500">
              Select a resume version on the left to view and edit its content.
            </p>
          ) : (
            <div className="flex flex-col gap-3 h-full">
              <div className="border-b border-slate-200 pb-2">
                <p className="text-xs text-slate-500 mb-1">
                  Track:{" "}
                  <span className="font-semibold text-slate-800">
                    {
                      resumes.find(
                        (r) => r.resume_id === selectedResumeId
                      )?.trackTitle
                    }
                  </span>
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedVersion.version_name || `Version ${selectedVersion.version_number}`}
                </p>
                <p className="text-[11px] text-slate-500">
                  Uploaded {formatDate(selectedVersion.uploaded_at)} •{" "}
                  {selectedVersion.file_name}
                </p>
              </div>

              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {contentLoading ? (
                  <p className="text-xs text-slate-500">Loading content...</p>
                ) : contentError ? (
                  <p className="text-xs text-red-500">{contentError}</p>
                ) : (
                  <div className="flex flex-col gap-2 flex-1">
                    {/* Quill Rich Text Editor */}
                    <div className="flex-1 border border-slate-300 rounded-md overflow-hidden flex flex-col bg-white">
                      <ReactQuill
                        value={editingContent}
                        onChange={handleContentChange}
                        theme="snow"
                        modules={{
                          toolbar: [
                            [{ header: [1, 2, 3, false] }],
                            ["bold", "italic", "underline", "strike"],
                            [{ list: "ordered" }, { list: "bullet" }],
                            ["blockquote", "code-block"],
                            ["link"],
                            ["clean"],
                          ],
                        }}
                        style={{
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {hasContentChanged && (
                        <button
                          onClick={() => {
                            setShowVersionModal(true);
                            setVersionModalError("");
                          }}
                          className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Save as New Version
                        </button>
                      )}
                      {selectedVersion.file_url && (
                        <a
                          href={selectedVersion.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 text-xs rounded bg-slate-600 text-white hover:bg-slate-700 inline-block"
                        >
                          Download File
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Upload modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-lg w-full mx-4 p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-900">
                New resume / version
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              You can have up to{" "}
              <span className="font-semibold">
                {limits.maxResumes} tracks
              </span>{" "}
              (e.g. &quot;Software Engineering Resume&quot;,
              &quot;Consulting Resume&quot;), and{" "}
              <span className="font-semibold">
                {limits.maxVersionsPerResume} versions
              </span>{" "}
              per track.
            </p>

            {/* Mode: new vs existing */}
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-700">
                Where should this version go?
              </p>
              <div className="flex flex-wrap gap-3 text-[11px]">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="mode"
                    value="new"
                    checked={createMode === "new"}
                    onChange={() => setCreateMode("new")}
                    disabled={hasMaxResumes}
                  />
                  <span>
                    New track{" "}
                    {hasMaxResumes && (
                      <span className="text-rose-600">
                        (max tracks reached)
                      </span>
                    )}
                  </span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="mode"
                    value="existing"
                    checked={createMode === "existing"}
                    onChange={() => setCreateMode("existing")}
                    disabled={resumes.length === 0}
                  />
                  <span>
                    Existing track{" "}
                    {resumes.length === 0 && (
                      <span className="text-slate-400">
                        (none yet)
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </div>

            {createMode === "new" ? (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">
                  Resume track title
                </label>
                <input
                  type="text"
                  className="w-full text-xs border border-slate-300 rounded px-2 py-1"
                  placeholder="e.g., Software Engineering Resume"
                  value={trackTitle}
                  onChange={(e) => setTrackTitle(e.target.value)}
                  disabled={hasMaxResumes}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">
                  Existing track
                </label>
                <select
                  className="w-full text-xs border border-slate-300 rounded px-2 py-1"
                  value={selectedTrackId || ""}
                  onChange={(e) =>
                    setSelectedTrackId(
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  disabled={resumes.length === 0}
                >
                  <option value="">Choose a track…</option>
                  {resumes.map((r) => (
                    <option key={r.resume_id} value={r.resume_id}>
                      {r.trackTitle} • {r.versions?.length || 0}/
                      {limits.maxVersionsPerResume} versions
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Version label */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">
                Version label (optional)
              </label>
              <input
                type="text"
                className="w-full text-xs border border-slate-300 rounded px-2 py-1"
                placeholder="e.g., Fall 2025 internship, FAANG-ready, etc."
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
              />
            </div>

            {/* File input */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-700">
                Upload resume file
              </label>
              <input
                type="file"
                accept=".doc,.docx,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="w-full text-xs"
                onChange={handleFileChange}
              />
              {file && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Selected: {file.name}
                </p>
              )}
              <p className="text-[10px] text-slate-400">
                Only Word (.doc, .docx) and plain text (.txt) files are
                allowed.
              </p>
            </div>

            {modalError && (
              <p className="text-[11px] text-rose-600">{modalError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleCloseModal}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitUpload}
                disabled={uploading}
                className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as New Version Modal */}
      {showVersionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-sm w-full mx-4 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Save as New Version
            </h2>
            <p className="text-xs text-slate-600">
              Give your updated resume a name to save it as a new version.
            </p>
            
            <input
              type="text"
              placeholder="e.g., Updated Resume, Final Version..."
              value={newVersionLabel}
              onChange={(e) => setNewVersionLabel(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded px-2 py-1"
            />
            
            {versionModalError && (
              <p className="text-xs text-red-500">{versionModalError}</p>
            )}
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowVersionModal(false);
                  setNewVersionLabel("");
                  setVersionModalError("");
                }}
                disabled={savingAsVersion}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsVersion}
                disabled={savingAsVersion || !newVersionLabel.trim()}
                className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingAsVersion ? "Saving..." : "Save Version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   Subcomponents
   ========================= */

function ResumeTrackCard({
  resume,
  expanded,
  onToggle,
  selectedVersion,
  onSelectVersion,
  limits,
  onDeleteVersion,
}) {
  const versionCount = resume.versions?.length || 0;
  const canAddMore = versionCount < limits.maxVersionsPerResume;

  return (
    <div className="border border-slate-200 rounded-lg p-3 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {resume.trackTitle}
          </p>
          <p className="text-[11px] text-slate-500">
            {versionCount} / {limits.maxVersionsPerResume} versions •{" "}
            Created {formatDate(resume.created_at)}
          </p>
        </div>
        <span className="text-[11px] text-slate-500">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 border-t border-slate-100 pt-2 space-y-1">
          {versionCount === 0 ? (
            <p className="text-[11px] text-slate-500">
              No versions yet. Use &quot;New resume / version&quot; to
              upload one.
            </p>
          ) : (
            <ul className="space-y-1">
              {resume.versions.map((v) => {
                const isSelected =
                  selectedVersion &&
                  selectedVersion.resume_versions_id ===
                    v.resume_versions_id;
                return (
                  <li
                    key={v.resume_versions_id}
                    className="flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectVersion(v)}
                      className={
                        "flex-1 text-left text-[11px] px-2 py-1 rounded " +
                        (isSelected
                          ? "bg-slate-900 text-white"
                          : "bg-slate-50 text-slate-800 hover:bg-slate-100")
                      }
                    >
                      <span className="font-medium">
                        {v.version_name || `Version ${v.version_number}`}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {v.file_name} • {formatDate(v.uploaded_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteVersion(v)}
                      className="text-[10px] px-2 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!canAddMore && (
            <p className="text-[10px] text-amber-700 mt-1">
              This track has reached the maximum of{" "}
              {limits.maxVersionsPerResume} versions. Delete an
              existing version to add a new one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
