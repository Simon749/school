'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in Next.js App Router
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: iconUrl.src,
    shadowUrl: iconShadowUrl.src,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

interface LeafletMapProps {
    latitude: number | null;
    longitude: number | null;
    radius?: number;
}

export function LeafletMap({ latitude, longitude, radius = 150 }: LeafletMapProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (
        !isMounted ||
        latitude == null ||
        longitude == null ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return (
            <div className="h-64 w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                <p className="text-sm text-slate-500">
                    {latitude === null ? 'Capture or enter coordinates to view map' : 'Loading map...'}
                </p>
            </div>
        );
    }

    const center: [number, number] = [latitude, longitude];

    return (
        <div className="h-64 w-full rounded-lg border border-slate-200 overflow-hidden relative z-0">
            <MapContainer center={center} zoom={15} scrollWheelZoom={false} className="h-full w-full">
                <ChangeView center={center} zoom={15} />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={center}>
                    <Popup>School Location</Popup>
                </Marker>
                {/* Visualizes the geofence radius */}
                {radius && (
                    <Circle
                        center={center}
                        radius={radius}
                        pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 0.1 }}
                    />
                )}
            </MapContainer>
        </div>
    );
}