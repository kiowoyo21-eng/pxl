'use client';

import { useId } from 'react';

type HeroStyle = {
  rim: string;
  rimLight: string;
  field: string;
  fieldLight: string;
  shirt: string;
  shirtShadow: string;
  cape: string;
  hair: string;
  hairLight: string;
  skin: string;
  skinShadow: string;
  accessory: string;
  pants: string;
};

const palettes: HeroStyle[] = [
  { rim: '#d9ab60', rimLight: '#ffdf91', field: '#314d60', fieldLight: '#668ca0', shirt: '#8cc8cd', shirtShadow: '#3b7288', cape: '#c68d65', hair: '#352c38', hairLight: '#6f5361', skin: '#e9b18c', skinShadow: '#c1846a', accessory: '#f3ca71', pants: '#303c58' },
  { rim: '#b8c8df', rimLight: '#f2f6ff', field: '#45406b', fieldLight: '#8e83ad', shirt: '#c8a6e4', shirtShadow: '#7863ad', cape: '#6d91c2', hair: '#5e364b', hairLight: '#a06c7d', skin: '#f0c7a3', skinShadow: '#c49177', accessory: '#a3e5e2', pants: '#363959' },
  { rim: '#c59aa9', rimLight: '#ffdeea', field: '#37544e', fieldLight: '#80b2a3', shirt: '#f0b897', shirtShadow: '#b77475', cape: '#8bb6a6', hair: '#292f41', hairLight: '#515d6f', skin: '#b67b5d', skinShadow: '#8e594b', accessory: '#e8c7e6', pants: '#514457' },
  { rim: '#c9b7de', rimLight: '#f4deff', field: '#5e493d', fieldLight: '#a9866f', shirt: '#a5d0b0', shirtShadow: '#53877f', cape: '#e9be75', hair: '#644239', hairLight: '#a77358', skin: '#dca480', skinShadow: '#ac765f', accessory: '#f2d0a2', pants: '#3d4b5a' },
  { rim: '#cbbf8e', rimLight: '#fff1b0', field: '#414d75', fieldLight: '#8196c3', shirt: '#e2b1c4', shirtShadow: '#9c6c98', cape: '#8c9ba7', hair: '#7e746e', hairLight: '#c3b39e', skin: '#f1caab', skinShadow: '#cb9e83', accessory: '#e3e786', pants: '#393b58' },
  { rim: '#9fb6b2', rimLight: '#daffde', field: '#6a455c', fieldLight: '#b17f91', shirt: '#b2badf', shirtShadow: '#6679b0', cape: '#d69a76', hair: '#343236', hairLight: '#685b64', skin: '#cb9878', skinShadow: '#a16c57', accessory: '#f5c96b', pants: '#374552' }
];

export function stableSeed(username: string): number {
  let hash = 2166136261;
  for (const letter of username.toUpperCase()) {
    hash ^= letter.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function HeroSprite({ seed, colors }: { seed: number; colors: HeroStyle }) {
  const hairStyle = seed % 4;
  const coat = (seed >>> 3) % 3;
  const { hair, hairLight, skin, skinShadow, shirt, shirtShadow, pants, cape, accessory } = colors;

  return <g shapeRendering="crispEdges">
    {/* Shadow and cape */}
    <rect x="8" y="38" width="27" height="3" fill="#14202c" opacity=".44" />
    {coat !== 1 && <><rect x="7" y="20" width="5" height="15" fill={cape} /><rect x="30" y="20" width="5" height="15" fill={cape} /></>}
    {/* Boots and tapered trousers */}
    <rect x="13" y="28" width="7" height="9" fill={pants}/><rect x="23" y="28" width="7" height="9" fill={pants}/>
    <rect x="11" y="35" width="9" height="4" fill="#28323e"/><rect x="23" y="35" width="9" height="4" fill="#28323e"/>
    <rect x="13" y="35" width="7" height="1" fill="#697387"/><rect x="23" y="35" width="7" height="1" fill="#697387"/>
    {/* Arms and modern RPG tunic */}
    <rect x="9" y="20" width="7" height="12" fill={shirtShadow}/><rect x="27" y="20" width="7" height="12" fill={shirtShadow}/>
    <rect x="10" y="22" width="4" height="7" fill={shirt}/><rect x="29" y="22" width="4" height="7" fill={shirt}/>
    <rect x="11" y="30" width="4" height="5" fill={skinShadow}/><rect x="29" y="30" width="4" height="5" fill={skin}/>
    <rect x="15" y="20" width="14" height="14" fill={shirtShadow}/>
    <rect x="16" y="20" width="12" height="9" fill={shirt}/>
    <rect x="20" y="21" width="3" height="8" fill={coat===2 ? accessory : '#e9edf4'} opacity=".8"/>
    <rect x="14" y="29" width="16" height="3" fill="#34384c"/>
    <rect x="24" y="29" width="3" height="3" fill={accessory}/>
    {/* Neck */}
    <rect x="18" y="17" width="8" height="5" fill={skinShadow}/>
    {/* Face */}
    <rect x="14" y="7" width="16" height="13" fill={skinShadow}/>
    <rect x="15" y="7" width="14" height="11" fill={skin}/>
    <rect x="16" y="13" width="3" height="3" fill="#262736"/><rect x="25" y="13" width="3" height="3" fill="#262736"/>
    <rect x="20" y="17" width="4" height="1" fill={skinShadow}/>
    <rect x="19" y="19" width="6" height="2" fill={accessory}/>
    {/* Hair silhouette varies by username */}
    <rect x="13" y="5" width="18" height="6" fill={hair}/>
    <rect x="14" y="4" width="14" height="3" fill={hair}/>
    <rect x="14" y="5" width="10" height="2" fill={hairLight}/>
    {hairStyle === 0 && <><rect x="12" y="8" width="4" height="8" fill={hair}/><rect x="29" y="8" width="3" height="6" fill={hair}/><rect x="17" y="9" width="9" height="2" fill={hair}/></>}
    {hairStyle === 1 && <><rect x="13" y="8" width="4" height="5" fill={hair}/><rect x="27" y="8" width="4" height="8" fill={hair}/><rect x="22" y="9" width="8" height="3" fill={hair}/></>}
    {hairStyle === 2 && <><rect x="12" y="8" width="4" height="10" fill={hair}/><rect x="29" y="8" width="3" height="10" fill={hair}/><rect x="16" y="9" width="5" height="2" fill={hair}/></>}
    {hairStyle === 3 && <><rect x="13" y="7" width="5" height="5" fill={hair}/><rect x="26" y="7" width="5" height="5" fill={hair}/><rect x="21" y="8" width="5" height="2" fill={hairLight}/></>}
    {/* Small contrasting shoulder armor */}
    <rect x="8" y="20" width="8" height="3" fill={accessory}/><rect x="28" y="20" width="7" height="3" fill={accessory}/>
  </g>;
}

export default function PixelCoin({ username, online, size = 'normal' }: {
  username: string;
  online?: boolean;
  size?: 'normal' | 'large';
}) {
  const uid = useId().replace(/:/g, '');
  const seed = stableSeed(username);
  const colors = palettes[seed % palettes.length];
  const fieldId = `field-${uid}`;
  const metalId = `metal-${uid}`;
  const clipId = `clip-${uid}`;

  return <div className={`coin-wrap coin-${size}`}>
    <svg viewBox="0 0 170 170" role="img" aria-label={`${username} pixel character coin`}>
      <defs>
        <linearGradient id={metalId} x1=".1" y1="0" x2=".85" y2="1">
          <stop offset="0" stopColor={colors.rimLight}/>
          <stop offset=".27" stopColor={colors.rim}/>
          <stop offset=".53" stopColor="#665b5b"/>
          <stop offset=".78" stopColor={colors.rim}/>
          <stop offset="1" stopColor={colors.rimLight}/>
        </linearGradient>
        <radialGradient id={fieldId} cx=".46" cy=".2" r=".85">
          <stop offset="0" stopColor={colors.fieldLight}/>
          <stop offset="1" stopColor={colors.field}/>
        </radialGradient>
        <clipPath id={clipId}><circle cx="85" cy="85" r="59" /></clipPath>
      </defs>
      <ellipse cx="85" cy="151" rx="55" ry="9" fill="#000" opacity=".20" />
      <circle cx="85" cy="85" r="80" fill="#121a26" stroke="#0a111a" strokeWidth="2" />
      <circle cx="85" cy="84" r="76" fill={`url(#${metalId})`} />
      <circle cx="85" cy="84" r="71" fill="none" stroke="#f9ecd8" strokeWidth="1" strokeOpacity=".47" />
      {Array.from({ length: 40 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 40;
        const a = 72, b = 75;
        return <line key={i} x1={85 + Math.cos(angle) * a} y1={84 + Math.sin(angle) * a}
          x2={85 + Math.cos(angle) * b} y2={84 + Math.sin(angle) * b}
          stroke="#473d3e" strokeWidth="1.8" strokeLinecap="round" opacity=".43" />;
      })}
      <circle cx="85" cy="85" r="66" fill="#182230" stroke={colors.rimLight} strokeWidth="2" strokeOpacity=".75" />
      <circle cx="85" cy="85" r="60" fill={`url(#${fieldId})`} />
      <g clipPath={`url(#${clipId})`}>
        <circle cx="113" cy="54" r="17" fill="#f2fff9" opacity=".055" />
        <path d="M22 122 Q85 97 148 123 L149 152 22 152Z" fill="#112032" opacity=".22" />
        <g transform="translate(23 20) scale(2.9)"><HeroSprite seed={seed} colors={colors}/></g>
      </g>
      <circle cx="85" cy="85" r="60" fill="none" stroke="#17202c" strokeWidth="4" />
      <circle cx="85" cy="85" r="64" fill="none" stroke={colors.rimLight} strokeWidth="1" strokeOpacity=".5" />
      <path d="M27 65 A60 60 0 0 1 70 27" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="2" strokeLinecap="round" />
    </svg>
    {online !== undefined && <span className={`coin-presence ${online ? 'active' : 'away'}`} aria-hidden="true" />}
  </div>;
}
