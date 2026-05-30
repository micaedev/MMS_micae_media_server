import { useCallback, useEffect, useState } from "react";
import type { BrowseResult, StorageRoot, StorageVolume } from "../api";
import {
  browseStorage,
  createStorageLocation,
  deleteStorageLocation,
  fetchStorageRoots,
  fetchStorageVolumes,
  getPreferredStorageId,
  setPreferredStorageId,
} from "../api";

type Props = {
  storageId: string;
  onStorageIdChange: (id: string) => void;
  onError: (msg: string | null) => void;
};

export default function StorageLocationSetup({
  storageId,
  onStorageIdChange,
  onError,
}: Props) {
  const [volumes, setVolumes] = useState<StorageVolume[]>([]);
  const [roots, setRoots] = useState<StorageRoot[]>([]);
  const [rootId, setRootId] = useState("");
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [newFolder, setNewFolder] = useState("mediaserver-videos");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const reloadVolumes = useCallback(async () => {
    const list = await fetchStorageVolumes();
    setVolumes(list);
    const pref = getPreferredStorageId();
    if (list.some((v) => v.id === pref)) onStorageIdChange(pref);
    else if (list[0]) onStorageIdChange(list[0].id);
    return list;
  }, [onStorageIdChange]);

  useEffect(() => {
    void (async () => {
      try {
        const [vols, rts] = await Promise.all([
          fetchStorageVolumes(),
          fetchStorageRoots(),
        ]);
        setVolumes(vols);
        setRoots(rts.filter((r) => r.available));
        const pref = getPreferredStorageId();
        if (vols.some((v) => v.id === pref)) onStorageIdChange(pref);
        else if (vols[0]) onStorageIdChange(vols[0].id);
        if (rts.length > 0) setRootId(rts.find((r) => r.available)?.id ?? rts[0].id);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Depolama yüklenemedi");
      }
    })();
  }, [onStorageIdChange, onError]);

  const loadBrowse = useCallback(
    async (rid: string, path: string) => {
      setBrowseLoading(true);
      try {
        const data = await browseStorage(rid, path);
        setBrowse(data);
        onError(null);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Klasör listelenemedi");
      } finally {
        setBrowseLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    if (showWizard && rootId) void loadBrowse(rootId, "");
  }, [showWizard, rootId, loadBrowse]);

  const onPickStorage = (id: string) => {
    onStorageIdChange(id);
    setPreferredStorageId(id);
  };

  const onCreateLocation = async () => {
    if (!rootId || !browse) return;
    setCreating(true);
    onError(null);
    try {
      const vol = await createStorageLocation({
        root_id: rootId,
        browse_path: browse.current_path,
        folder_name: newFolder.trim(),
        label: newLabel.trim() || newFolder.trim(),
      });
      await reloadVolumes();
      onPickStorage(vol.id);
      setShowWizard(false);
      setNewFolder("mediaserver-videos");
      setNewLabel("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Kayıt yeri oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  const onDeleteLocation = async (id: string) => {
    if (!confirm("Bu kayıt yerini silmek istiyor musunuz? (Klasör diskte kalır)"))
      return;
    try {
      await deleteStorageLocation(id);
      await reloadVolumes();
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Silinemedi");
    }
  };

  const selected = volumes.find((v) => v.id === storageId);
  const availableRoots = roots.filter((r) => r.available);

  return (
    <section className="card">
      <h2 className="section-title">Kayıt yeri</h2>
      <p className="help">
        Yüklemeden önce hedef diski/klasörü seçin. Yeni bir klasör oluşturmak için
        aşağıdaki sihirbazı kullanın. Disklerin PC&apos;de görünmesi için{" "}
        <code>docker-compose</code> içinde mount tanımlı olmalıdır.
      </p>

      {volumes.length === 0 ? (
        <p className="empty">Kayıt yeri yükleniyor…</p>
      ) : (
        <div className="storage-grid">
          {volumes.map((v) => (
            <div
              key={v.id}
              className={
                storageId === v.id
                  ? "storage-option-wrap storage-option-wrap-active"
                  : "storage-option-wrap"
              }
            >
              <label className="storage-option">
                <input
                  type="radio"
                  name="storage"
                  checked={storageId === v.id}
                  onChange={() => onPickStorage(v.id)}
                />
                <strong>{v.label}</strong>
                {v.custom && <span className="storage-custom-tag">Özel</span>}
                <span className="storage-host">PC: {v.host_path}</span>
              </label>
              {v.custom && (
                <button
                  type="button"
                  className="btn btn-ghost btn-tiny"
                  onClick={() => void onDeleteLocation(v.id)}
                >
                  Kayıt yerini kaldır
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <p className="help">
          PC&apos;de tam yol: <code>{selected.host_path}</code>
          <br />
          <span className="help-muted">
            Konteyner içi: <code>{selected.container_path}</code>
          </span>
        </p>
      )}

      <div className="storage-wizard-toggle">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowWizard((s) => !s)}
        >
          {showWizard ? "Sihirbazı gizle" : "+ Başka diskte yeni klasör oluştur"}
        </button>
      </div>

      {showWizard && (
        <div className="storage-wizard">
          {availableRoots.length === 0 ? (
            <p className="error">
              Gezilebilir disk yok. .env içinde STORAGE_BROWSE_ROOTS ve compose
              volume mount ekleyin, ardından{" "}
              <code>docker compose up -d --force-recreate</code>.
            </p>
          ) : (
            <>
              <label className="field-label">
                Disk / kök
                <select
                  value={rootId}
                  onChange={(e) => {
                    setRootId(e.target.value);
                    void loadBrowse(e.target.value, "");
                  }}
                >
                  {availableRoots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.host_path}
                    </option>
                  ))}
                </select>
              </label>

              <div className="browse-panel">
                <div className="browse-toolbar">
                  <button
                    type="button"
                    className="btn btn-ghost btn-tiny"
                    disabled={browse?.current_path === "" || browseLoading}
                    onClick={() =>
                      browse &&
                      void loadBrowse(rootId, browse.parent_path ?? "")
                    }
                  >
                    ↑ Üst
                  </button>
                  <code className="browse-path">
                    {browse?.host_display ?? "…"}
                  </code>
                  {browseLoading && <span className="browse-loading">…</span>}
                </div>
                <ul className="browse-list">
                  {(browse?.entries ?? []).map((entry) => (
                    <li key={entry.path}>
                      <button
                        type="button"
                        className="browse-item"
                        onClick={() => void loadBrowse(rootId, entry.path)}
                      >
                        📁 {entry.name}
                      </button>
                    </li>
                  ))}
                  {browse && browse.entries.length === 0 && !browseLoading && (
                    <li className="browse-empty">Alt klasör yok</li>
                  )}
                </ul>
              </div>

              <div className="field-row">
                <label className="field-label">
                  Yeni klasör adı
                  <input
                    type="text"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                    placeholder="mediaserver-videos"
                  />
                </label>
                <label className="field-label">
                  Panelde görünen ad (isteğe bağlı)
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Mağaza diski"
                  />
                </label>
              </div>

              <p className="help">
                Oluşturulacak tam yol:{" "}
                <code>
                  {browse?.host_display}/{newFolder || "…"}
                </code>
              </p>

              <button
                type="button"
                className="btn btn-primary"
                disabled={creating || !newFolder.trim() || browseLoading}
                onClick={() => void onCreateLocation()}
              >
                {creating ? "Oluşturuluyor…" : "Klasörü oluştur ve seç"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
