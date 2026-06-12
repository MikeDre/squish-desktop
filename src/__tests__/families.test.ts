import { describe, it, expect } from 'vitest';
import { detectFamilyFromExtension, FAMILY_META } from '../lib/families';

describe('detectFamilyFromExtension', () => {
  it.each([
    ['photo.jpg', 'image'],
    ['photo.JPEG', 'image'],
    ['photo.png', 'image'],
    ['photo.webp', 'image'],
    ['photo.avif', 'image'],
    ['photo.heic', 'image'],
    ['photo.gif', 'image'],
    ['photo.svg', 'image'],
  ])('classifies %s as image', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it.each([
    ['song.mp3', 'audio'],
    ['song.flac', 'audio'],
    ['song.opus', 'audio'],
    ['song.aac', 'audio'],
    ['song.m4a', 'audio'],
    ['song.wav', 'audio'],
  ])('classifies %s as audio', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it.each([
    ['clip.mp4', 'video'],
    ['clip.mkv', 'video'],
    ['clip.mov', 'video'],
    ['clip.webm', 'video'],
  ])('classifies %s as video', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it.each([
    ['x.js', 'code'],
    ['x.ts', 'code'],
    ['x.tsx', 'code'],
    ['x.jsx', 'code'],
    ['x.css', 'code'],
    ['x.html', 'code'],
    ['x.htm', 'code'],
    ['x.json', 'code'],
  ])('classifies %s as code', (name, fam) => {
    expect(detectFamilyFromExtension(name)).toBe(fam);
  });

  it('returns null for unknown extension', () => {
    expect(detectFamilyFromExtension('mystery.xyz')).toBeNull();
  });

  it('returns null for files without extension', () => {
    expect(detectFamilyFromExtension('Makefile')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectFamilyFromExtension('PHOTO.JPG')).toBe('image');
    expect(detectFamilyFromExtension('Song.MP3')).toBe('audio');
  });
});

describe('FAMILY_META', () => {
  it('has a label for every family', () => {
    expect(FAMILY_META.image.label).toBeTruthy();
    expect(FAMILY_META.audio.label).toBeTruthy();
    expect(FAMILY_META.video.label).toBeTruthy();
    expect(FAMILY_META.code.label).toBeTruthy();
  });
});
