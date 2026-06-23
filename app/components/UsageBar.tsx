// components/UsageBar.tsx
import React from 'react';
import { Box, Typography, LinearProgress, linearProgressClasses } from '@mui/material';
import { styled } from '@mui/material/styles';

interface UsageBarProps {
  label: string;
  value: number;
}

const getColor = (value: number): string => {
  if (value < 50) return '#4caf50';
  if (value < 80) return '#ff9800';
  return '#f44336';
};

export const UsageBar: React.FC<UsageBarProps> = ({ label, value }) => {
  const color = getColor(value);

  const ColoredLinearProgress = styled(LinearProgress)(() => ({
    height: 10,
    borderRadius: 5,
    [`&.${linearProgressClasses.colorPrimary}`]: {
      backgroundColor: '#eee',
    },
    [`& .${linearProgressClasses.bar}`]: {
      borderRadius: 5,
      backgroundColor: color,
    },
  }));

  return (
    <Box sx={{ margin: '8px' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {`${value}%`}
        </Typography>
      </Box>

      <ColoredLinearProgress variant="determinate" value={value} />
    </Box>
  );
};