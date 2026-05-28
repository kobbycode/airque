'use client';

import { useEffect, useState } from 'react';

export default function CustomCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Hide default cursor globally
    document.body.style.cursor = 'none';

    const updatePosition = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Expand cursor when hovering over clickable elements
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.tagName === 'INPUT' ||
        target.closest('button') ||
        target.closest('a') ||
        target.classList.contains('cursor-pointer')
      ) {
        setIsHovering(true);
      } else {
        setIsHovering(false);
      }
    };

    const handleMouseDown = () => setIsActive(true);
    const handleMouseUp = () => setIsActive(false);

    window.addEventListener('mousemove', updatePosition);
    window.addEventListener('mouseover', handleMouseOver);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', updatePosition);
      window.removeEventListener('mouseover', handleMouseOver);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'auto';
    };
  }, []);

  return (
    <>
      {/* Outer subtle cyan/white trailing ring */}
      <div
        className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-full border border-white/30 transition-all duration-300 ease-out"
        style={{
          width: isHovering ? '48px' : '28px',
          height: isHovering ? '48px' : '28px',
          transform: `translate(${position.x - (isHovering ? 24 : 14)}px, ${
            position.y - (isHovering ? 24 : 14)
          }px) scale(${isActive ? 0.85 : 1})`,
          boxShadow: isHovering ? '0 0 20px rgba(6, 182, 212, 0.4)' : 'none',
          borderColor: isHovering ? 'rgba(6, 182, 212, 0.6)' : 'rgba(255, 255, 255, 0.3)',
        }}
      />
      
      {/* Inner solid white dot */}
      <div
        className="fixed top-0 left-0 pointer-events-none z-[10000] rounded-full transition-transform duration-75 ease-out"
        style={{
          width: '6px',
          height: '6px',
          background: 'white',
          boxShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
          transform: `translate(${position.x - 3}px, ${position.y - 3}px) scale(${
            isHovering ? 0 : 1
          })`,
        }}
      />
    </>
  );
}
