import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Default to current year if not provided
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  try {
    // Free, no-auth API for public holidays (Country Code 'KE' = Kenya)
    // Source: https://date.nager.at/
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KE`, {
      next: { revalidate: 86400 }, // Cache for 24 hours to be kind to the free API
    });

    if (!response.ok) {
      throw new Error(`Holiday API responded with status: ${response.status}`);
    }
    
    const holidays = await response.json();
    
    return NextResponse.json({ 
      year, 
      country: 'KE',
      holidays 
    });
  } catch (error) {
    console.error('Failed to fetch holidays:', error);
    return NextResponse.json(
      { error: 'Failed to fetch holidays. Please try again later.' }, 
      { status: 500 }
    );
  }
}