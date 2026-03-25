export const genDayLMP = (regime) => {
  const profiles = { solar: { base: 35, vol: 15 }, ramp: { base: 60, vol: 40 }, stress: { base: 120, vol: 80 } };
  const p = profiles[regime] || profiles.ramp;
  return Array.from({ length: 24 }, (_, he) => {
    const solarMod = he >= 10 && he <= 15 ? -0.6 : he >= 17 && he <= 21 ? 1.2 : 0;
    const lmp = Math.max(-15, p.base + solarMod * p.base * 0.8 + (Math.random() - 0.5) * p.vol);
    const soc = he < 10 ? 40 + he * 3 : he < 16 ? 70 + (he - 10) * 4 : 95 - (he - 16) * 12;
    return { time: `HE${String(he).padStart(2, "0")}`, lmp: +lmp.toFixed(2), soc: Math.max(15, Math.min(98, soc + (Math.random() - 0.5) * 8)) };
  });
};

export const genWeatherHistory = () => {
  return Array.from({ length: 24 }, (_, he) => {
    const solar = he >= 6 && he <= 18 ? Math.sin((he - 6) / 12 * Math.PI) * 0.8 : 0;
    const thermal = he >= 10 ? Math.min(0.9, (he - 10) * 0.08 + Math.random() * 0.1) : 0.1;
    const composite = thermal * 0.35 + (-solar) * 0.25 + 0.2 * 0.55 + (Math.random() - 0.5) * 0.08;
    return { time: `HE${String(he).padStart(2, "0")}`, score: +composite.toFixed(3), thermal: +thermal.toFixed(2), solar: +(-solar).toFixed(2) };
  });
};

export const genWTIHistory = () => {
  let wti = 76.5;
  let cushing = 25.8;
  return Array.from({ length: 52 }, (_, w) => {
    wti += (Math.random() - 0.48) * 2.5;
    cushing += (Math.random() - 0.5) * 1.8;
    wti = Math.max(62, Math.min(95, wti));
    cushing = Math.max(20, Math.min(45, cushing));
    return { label: `W${w + 1}`, wti: +wti.toFixed(2), cushing: +cushing.toFixed(1) };
  });
};

export const genSCED = (n, reg) => {
  const p = { solar: [22, 14], ramp: [195, 150], stress: [650, 500] }[reg] || [195, 150];
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(now - (n - i) * 300000);
    return {
      time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
      lmp: +(Math.max(-30, p[0] + (Math.random() - 0.45) * p[1])).toFixed(2),
      soc: +(35 + Math.random() * 55).toFixed(0),
      as: +(Math.random() * 80).toFixed(0),
    };
  });
};
