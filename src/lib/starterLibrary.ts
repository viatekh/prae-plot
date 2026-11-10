// Generic fixtures that ship with the app, so a plot can be started without
// first hunting down GDTF files. Figures are typical for the class of fixture,
// not any one product — weight and power are editable once a fixture is placed,
// and an imported GDTF file replaces a stand-in whenever the real data matters.

import type { GDTFFixtureType, FixtureSymbolType } from '../types'

function generic(
  slug: string, name: string, shortName: string, symbol: FixtureSymbolType,
  watts: number, kg: number, modes: [string, number][],
): GDTFFixtureType {
  return {
    id: `generic:${slug}`,
    manufacturer: 'Generic',
    name, shortName, symbol,
    powerConsumption: watts,
    weight: kg,
    modes: modes.map(([modeName, channelCount]) => ({ name: modeName, channelCount })),
  }
}

export const STARTER_LIBRARY: GDTFFixtureType[] = [
  // Conventionals
  generic('par64', 'PAR 64 1kW', 'PAR64', 'par', 1000, 3, [['Dimmer', 1]]),
  generic('profile-750', 'Profile 750W', 'Profile', 'spot', 750, 6.5, [['Dimmer', 1]]),
  generic('fresnel-1k', 'Fresnel 1kW', 'Fresnel', 'flood', 1000, 5.5, [['Dimmer', 1]]),
  generic('fresnel-2k', 'Fresnel 2kW', 'Fres 2k', 'flood', 2000, 9, [['Dimmer', 1]]),
  generic('blinder-2', 'Blinder 2-lite', 'Blinder', 'strobe', 1300, 4.5, [['2 channel', 2], ['1 channel', 1]]),
  // LED
  generic('led-par', 'LED PAR RGBW', 'LED PAR', 'par', 150, 4, [['8 channel', 8], ['4 channel', 4]]),
  generic('led-batten', 'LED Batten 1m', 'Batten', 'pixel', 120, 5, [['12 channel', 12], ['4 channel', 4], ['48 channel', 48]]),
  generic('led-strobe', 'LED Strobe', 'Strobe', 'strobe', 400, 6, [['6 channel', 6], ['3 channel', 3]]),
  // Moving lights
  generic('mh-wash', 'Moving Head Wash', 'MH Wash', 'wash', 400, 10, [['Standard 16ch', 16], ['Extended 24ch', 24]]),
  generic('mh-spot', 'Moving Head Spot', 'MH Spot', 'spot', 550, 22, [['Standard 24ch', 24], ['Extended 32ch', 32]]),
  generic('mh-profile', 'Moving Head Profile', 'MH Prof', 'spot', 900, 32, [['Standard 34ch', 34], ['Extended 44ch', 44]]),
  generic('mh-beam', 'Moving Head Beam', 'MH Beam', 'beam', 300, 17, [['Standard 16ch', 16], ['Extended 20ch', 20]]),
  // Atmospherics
  generic('hazer', 'Hazer', 'Hazer', 'other', 300, 9, [['2 channel', 2]]),
  generic('smoke', 'Smoke Machine', 'Smoke', 'other', 1100, 8, [['1 channel', 1]]),
]
