'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin,
  Search,
  Crosshair,
  X,
  Check,
  Loader2,
  Copy,
  ExternalLink,
  Navigation,
  AlertCircle,
  Building,
} from 'lucide-react';
import Button from '@/components/ui/Button';

// Parse incoming coordinates string (e.g. "13.0827, 80.2707" or "13.0827° N, 80.2707° E")
function parseCoordinates(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.replace(/[°NSEWnsew]/g, '').trim();
  const parts = cleaned.split(/[\s,]+/);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

export default function LocationPickerModal({
  isOpen,
  onClose,
  initialCoordinates = '',
  initialAddress = '',
  onSelectLocation,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // States
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [detectedAddress, setDetectedAddress] = useState('');
  const [syncAddress, setSyncAddress] = useState(true);
  const [copied, setCopied] = useState(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');

  // Geolocation loading state
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Reverse geocoding helper
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      // 1. Try our internal API route
      let res = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`).catch(() => null);
      let json = res && res.ok ? await res.json().catch(() => null) : null;

      // 2. Direct fallback to OpenStreetMap Nominatim if needed
      if (!json || !json.data) {
        res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        ).catch(() => null);
        if (res && res.ok) {
          const directData = await res.json().catch(() => null);
          if (directData) json = { success: true, data: directData };
        }
      }

      if (json?.data?.display_name) {
        setDetectedAddress(json.data.display_name);
      } else {
        setDetectedAddress('');
      }
    } catch {
      setDetectedAddress('');
    }
  }, []);

  // Update marker position and reverse geocode
  const updateMarkerPosition = useCallback(
    (lat, lng, L_instance, fly = false, zoomLevel = null) => {
      setSelectedCoords({ lat, lng });

      if (mapInstanceRef.current && markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
        if (fly) {
          const targetZoom = zoomLevel || Math.max(mapInstanceRef.current.getZoom(), 15);
          mapInstanceRef.current.flyTo([lat, lng], targetZoom, { duration: 1.2 });
        }
      }

      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  // Initialize Map
  useEffect(() => {
    if (!isOpen) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
      return;
    }

    let isMounted = true;

    // Small delay to ensure modal DOM container is fully rendered and sized
    const timer = setTimeout(async () => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      try {
        const L = (await import('leaflet')).default;
        if (!isMounted || !mapContainerRef.current) return;

        // Custom stylish SVG pin icon
        const pinIcon = L.divIcon({
          className: 'custom-map-marker',
          html: `
            <div style="position: relative; width: 36px; height: 42px; transform: translate(-50%, -100%);">
              <svg width="36" height="42" viewBox="0 0 36 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <filter id="pin-shadow" x="-20%" y="-10%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
                  </filter>
                  <linearGradient id="pin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0284c7"/>
                    <stop offset="100%" stop-color="#0369a1"/>
                  </linearGradient>
                </defs>
                <path d="M18 0C8.05887 0 0 8.05887 0 18C0 27.5 16 41 18 42C20 41 36 27.5 36 18C36 8.05887 27.9411 0 18 0Z" fill="url(#pin-grad)" filter="url(#pin-shadow)"/>
                <circle cx="18" cy="18" r="7" fill="#ffffff"/>
                <circle cx="18" cy="18" r="4" fill="#0284c7"/>
              </svg>
              <div style="
                position: absolute;
                bottom: -4px;
                left: 50%;
                transform: translateX(-50%);
                width: 10px;
                height: 4px;
                background: rgba(0,0,0,0.3);
                border-radius: 50%;
                filter: blur(1px);
              "></div>
            </div>
          `,
          iconSize: [36, 42],
          iconAnchor: [18, 42],
        });

        // Determine initial center
        const parsed = parseCoordinates(initialCoordinates);
        // Default to India center (or parsed site coordinates)
        const defaultCenter = parsed ? [parsed.lat, parsed.lng] : [13.0827, 80.2707];
        const defaultZoom = parsed ? 16 : 12;

        const map = L.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: defaultZoom,
          zoomControl: false,
        });

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        // Marker (draggable)
        const marker = L.marker(defaultCenter, {
          icon: pinIcon,
          draggable: true,
        }).addTo(map);

        mapInstanceRef.current = map;
        markerRef.current = marker;

        setSelectedCoords({ lat: defaultCenter[0], lng: defaultCenter[1] });
        if (initialAddress) {
          setDetectedAddress(initialAddress);
        } else {
          reverseGeocode(defaultCenter[0], defaultCenter[1]);
        }

        // Click on map to move marker
        map.on('click', (e) => {
          const { lat, lng } = e.latlng;
          updateMarkerPosition(lat, lng, L, false);
        });

        // Drag marker
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          updateMarkerPosition(pos.lat, pos.lng, L, false);
        });

        // Invalidate map size after mounting
        setTimeout(() => {
          if (map) map.invalidateSize();
        }, 200);

        // If no initial coordinates provided, try to find user's current location smoothly
        if (!parsed && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMounted) return;
              const { latitude, longitude } = pos.coords;
              updateMarkerPosition(latitude, longitude, L, true, 15);
            },
            () => {},
            { timeout: 5000, enableHighAccuracy: true }
          );
        }
      } catch (err) {
        console.error('Failed to initialize Leaflet map:', err);
      }
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isOpen, initialCoordinates, initialAddress, reverseGeocode, updateMarkerPosition]);

  // Handle Search Places
  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      // 1. Try internal geocode route
      let res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`).catch(
        () => null
      );
      let json = res && res.ok ? await res.json().catch(() => null) : null;

      // 2. Direct fallback if needed
      if (!json || !json.data || json.data.length === 0) {
        res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchQuery.trim()
          )}&limit=6&addressdetails=1`
        ).catch(() => null);
        if (res && res.ok) {
          const directData = await res.json().catch(() => null);
          if (directData && directData.length > 0) {
            json = { success: true, data: directData };
          }
        }
      }

      if (json?.data && json.data.length > 0) {
        setSearchResults(json.data);
      } else {
        setSearchError('No locations found matching your query.');
      }
    } catch {
      setSearchError('Error searching for location. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Select a search result
  const handleSelectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      updateMarkerPosition(lat, lng, null, true, 16);
      setDetectedAddress(result.display_name || '');
      setSearchResults([]);
      setSearchQuery(result.display_name?.split(',')[0] || searchQuery);
    }
  };

  // Get User Current Location
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setLocationError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        updateMarkerPosition(latitude, longitude, null, true, 16);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          setLocationError('Location permission denied.');
        } else {
          setLocationError('Unable to retrieve current location.');
        }
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Copy coordinates string
  const handleCopy = () => {
    if (!selectedCoords) return;
    const str = `${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`;
    navigator.clipboard.writeText(str);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Confirm and Apply Location
  const handleConfirm = () => {
    if (!selectedCoords) return;
    const formatted = `${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`;

    onSelectLocation?.({
      coordinates: formatted,
      latitude: selectedCoords.lat,
      longitude: selectedCoords.lng,
      address: syncAddress && detectedAddress ? detectedAddress : undefined,
    });

    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop: closes only from the close or cancel buttons, like every other popup */}
      <div className="fixed inset-0 transition-opacity bg-black/80 backdrop-blur-xs" />

      {/* Modal Dialog */}
      <div
        className="relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-5 py-3.5 backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 leading-tight">
                Select Site Location
              </h3>
              <p className="text-xs text-slate-400">
                Search place or click anywhere on the map to pin exact site coordinates.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#d32f2f] text-white shadow-sm transition-colors hover:bg-[#b71c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef5350] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
            <span className="sr-only">Close map popup</span>
          </button>
        </div>

        {/* Search & Action Bar */}
        <div className="relative border-b border-slate-800 bg-slate-950/60 p-3 sm:px-5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (searchResults.length > 0) setSearchResults([]);
                }}
                placeholder="Search a city, landmark or street…"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSearching || !searchQuery.trim()}
              className="shrink-0 text-xs px-3.5"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLocateMe}
              disabled={isLocating}
              title="Use current GPS position"
              className="shrink-0 flex items-center gap-1.5 border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-xs px-3"
            >
              {isLocating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
              ) : (
                <Crosshair className="h-3.5 w-3.5 text-sky-400" />
              )}
              <span className="hidden sm:inline">Locate Me</span>
            </Button>
          </form>

          {/* Search Error Notice */}
          {searchError && (
            <p className="mt-1.5 text-xs text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {searchError}
            </p>
          )}

          {/* Location Error Notice */}
          {locationError && (
            <p className="mt-1.5 text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {locationError}
            </p>
          )}

          {/* Search Suggestions Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-3 right-3 sm:left-5 sm:right-5 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
              <div className="p-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1 border-b border-slate-700/50">
                Found Locations ({searchResults.length})
              </div>
              <ul className="divide-y divide-slate-700/40">
                {searchResults.map((item, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => handleSelectSearchResult(item)}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-700/60 transition-colors flex items-start gap-2.5"
                    >
                      <MapPin className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-200 truncate">
                          {item.display_name.split(',')[0]}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {item.display_name}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                        {parseFloat(item.lat).toFixed(4)}, {parseFloat(item.lon).toFixed(4)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Map View Container */}
        <div className="relative flex-1 min-h-[360px] sm:min-h-[420px] bg-slate-950">
          <div ref={mapContainerRef} className="absolute inset-0 h-full w-full z-10" />

          {/* Quick Helper Overlay Badge */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none rounded-lg bg-slate-900/85 px-2.5 py-1 text-[11px] text-slate-300 backdrop-blur-xs border border-slate-700/70 shadow-md">
            Click map or drag pin to adjust coordinates
          </div>
        </div>

        {/* Selected Coordinates & Address Details Footer */}
        <div className="shrink-0 border-t border-slate-800 bg-slate-900/95 p-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {/* Coordinates Readout */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Target Coordinates
                </span>
                {selectedCoords && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {selectedCoords ? (
                <div className="font-mono text-sm sm:text-base font-bold text-sky-400 tracking-wide">
                  {selectedCoords.lat.toFixed(6)}, {selectedCoords.lng.toFixed(6)}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic">No location pinned yet</div>
              )}
            </div>

            {/* Reverse Geocoded Address Preview */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Detected Physical Address
                </span>
                {detectedAddress && (
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={syncAddress}
                      onChange={(e) => setSyncAddress(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800 text-sky-600 focus:ring-sky-500 h-3.5 w-3.5"
                    />
                    <span>Update site address</span>
                  </label>
                )}
              </div>
              <div className="text-xs text-slate-300 line-clamp-2" title={detectedAddress}>
                {detectedAddress || (
                  <span className="text-slate-500 italic">
                    Drag pin or click map to resolve nearest address
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-[11px] text-slate-400 hidden sm:block">
              {selectedCoords && (
                <span>
                  Lat: <strong className="text-slate-200">{selectedCoords.lat.toFixed(5)}</strong> ·
                  Lng: <strong className="text-slate-200">{selectedCoords.lng.toFixed(5)}</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={!selectedCoords}
                className="bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                <span>Store Coordinates</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
