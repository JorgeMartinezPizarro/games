"use client";
import { useEffect, useState } from "react";

export function useStats(interval = 666) {
  const [stats, setStats] = useState<Record<string, any>>({});
  const [timestamp, setTimestamp] = useState<number>(0);
  const url = "/bookmarks/api/report";
  
  useEffect(() => {
    let isMounted = true; // evita actualizar estado si el componente se desmonta
	
    const fetchStats = async () => {
      try {
		
        const res = await fetch(url);
        const json = await res.json();

        if (json.changed && json.data) {
          if (isMounted) {
            setStats((prevStats) => ({
              ...prevStats,         // mantenemos datos previos
              ...json.data,         // sobrescribimos solo las claves cambiadas
            }));
            setTimestamp(json.timestamp);
          }
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      }
    };

    fetchStats(); // fetch inicial
    const id = setInterval(fetchStats, interval);

    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [url, interval]);

  return stats;
}
