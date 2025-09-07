// tests/calendar-integration.test.js - Test Google Calendar Integration
import { CalendarConnector } from '../src/integrations/calendar.js';
import dotenv from 'dotenv';

dotenv.config();

// Mock attendee data for testing
const mockAttendees = [
  { name: 'John Developer', email: 'john@company.com' },
  { name: 'Jane Reviewer', email: 'jane@company.com' },
  
];

const mockMeetingData = {
  title: 'Code Review: Authentication System PR #123',
  description: 'Review the new OAuth 2.0 implementation and discuss security improvements.',
  duration: 30, // minutes
  location: 'Google Meet',
  createVideoCall: true,
  attendees: mockAttendees,
  timezone: 'America/New_York',
  prNumber: '123',
  repository: 'company/auth-service',
  slackChannel: '#auth-review-123',
  notionPage: 'https://notion.so/auth-review-agenda'
};

async function testCalendarIntegration() {
  console.log('🧪 Testing Google Calendar Integration...\n');

  const calendar = new CalendarConnector();
  await calendar.initialize();

  // You'll need a Google Calendar OAuth token for testing
  const testToken = process.env.GOOGLE_CALENDAR_TEST_TOKEN;
  
  if (!testToken) {
    console.log('❌ No GOOGLE_CALENDAR_TEST_TOKEN found in environment variables');
    console.log('To get a Google Calendar token:');
    console.log('1. Go to: https://console.cloud.google.com/');
    console.log('2. Create/select project → Enable Calendar API');
    console.log('3. Create OAuth 2.0 credentials');
    console.log('4. Use OAuth playground to get access token');
    console.log('5. Add it to .env: GOOGLE_CALENDAR_TEST_TOKEN=your_token_here');
    console.log('\n📝 Required Google Calendar API Scopes:');
    console.log('   - https://www.googleapis.com/auth/calendar');
    console.log('   - https://www.googleapis.com/auth/calendar.events');
    return;
  }

  try {
    // Test 1: Get calendar info
    console.log('📋 Test 1: Get calendar information...');
    const calendarInfo = await calendar.getCalendarInfo(testToken);
    console.log(`✅ Calendar: ${calendarInfo.summary}`);
    console.log(`   Timezone: ${calendarInfo.timeZone}`);
    console.log(`   Access: ${calendarInfo.accessRole}`);
    console.log();

    // Test 2: Extract calendar IDs from attendees
    console.log('📋 Test 2: Test attendee email extraction...');
    const calendarIds = calendar.extractCalendarIds(mockAttendees);
    console.log(`✅ Extracted ${calendarIds.length} calendar IDs:`);
    calendarIds.forEach(id => console.log(`   - ${id}`));
    console.log();

    // Test 3: Get existing calendar events (next 7 days)
    console.log('📋 Test 3: Fetch upcoming calendar events...');
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const events = await calendar.getCalendarEvents(testToken, now, nextWeek, 'test_events_001');
    console.log(`✅ Found ${events.length} events in the next 7 days`);
    
    if (events.length > 0) {
      console.log('   Recent events:');
      events.slice(0, 3).forEach(event => {
        console.log(`   - ${event.title} (${event.start.toLocaleDateString()})`);
      });
    }
    console.log();

    // Test 4: Time formatting
    console.log('📋 Test 4: Test time formatting...');
    const testStart = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    const testEnd = new Date(testStart.getTime() + 30 * 60 * 1000); // 30 minutes later
    const formatted = calendar.formatMeetingTime(testStart, testEnd, 'America/New_York');
    console.log(`✅ Time formatting: ${formatted}`);
    console.log();

    // Test 5: Meeting description building
    console.log('📋 Test 5: Test meeting description building...');
    const description = calendar.buildMeetingDescription(mockMeetingData);
    console.log('✅ Meeting description generated:');
    console.log(description.split('\n').map(line => `   ${line}`).join('\n'));
    console.log();

    // Test 6: Attendee list building
    console.log('📋 Test 6: Test attendee list building...');
    const attendeeList = calendar.buildAttendeeList(mockAttendees);
    console.log(`✅ Built attendee list with ${attendeeList.length} members:`);
    attendeeList.forEach(attendee => {
      console.log(`   - ${attendee.displayName || attendee.email} (${attendee.email})`);
    });
    console.log();

    // Test 7: Time slot utilities
    console.log('📋 Test 7: Test time utilities...');
    const testTime = new Date('2024-12-31T10:07:00Z');
    const rounded = calendar.roundToNextQuarter(testTime);
    console.log(`✅ Time rounding: ${testTime.toISOString()} → ${rounded.toISOString()}`);
    console.log();

    console.log('🎉 All Calendar integration tests passed!');
    console.log('\n💡 To test meeting creation and scheduling:');
    console.log('   1. Make sure your Google Calendar token has write permissions');
    console.log('   2. Run: npm run test:calendar:live');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 401) {
      console.log('💡 Token expired or invalid - get a fresh token from Google');
    } else if (error.code === 403) {
      console.log('💡 Check that Calendar API is enabled and you have the right scopes');
    } else if (error.code === 404) {
      console.log('💡 Calendar not found - make sure you\'re using the right calendar ID');
    }
    
    console.error('Full error:', error);
  } finally {
    await calendar.cleanup();
  }
}

// Test with actual calendar operations (creates real events!)
async function testCalendarLive() {
  console.log('🚀 Testing Live Calendar Operations (CREATES REAL EVENTS)...\n');
  console.log('⚠️  This test will create actual calendar events!');
  console.log('   Make sure you\'re using a test calendar or be prepared to delete events.\n');

  const calendar = new CalendarConnector();
  await calendar.initialize();

  const testToken = process.env.GOOGLE_CALENDAR_TEST_TOKEN;
  if (!testToken) {
    console.log('❌ Missing GOOGLE_CALENDAR_TEST_TOKEN');
    return;
  }

  try {
    // Test: Find optimal meeting time
    console.log('📋 Finding optimal meeting time...');
    const preferences = {
      duration: 30,
      timeMin: new Date(),
      timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // next 7 days
      workingHours: { start: 9, end: 17 },
      timezone: 'America/New_York'
    };

    // Use your own email or test emails
    const testAttendees = [
      process.env.TEST_EMAIL_1 || 'test1@example.com',
      process.env.TEST_EMAIL_2 || 'test2@example.com'
    ];

    console.log(`   Checking availability for: ${testAttendees.join(', ')}`);
    
    const optimalTime = await calendar.findOptimalTime(
      testAttendees,
      testToken,
      'live_test_001',
      preferences
    );

    console.log('✅ Optimal time found:');
    console.log(`   Time: ${optimalTime.formatted}`);
    console.log(`   Confidence: ${(optimalTime.confidence * 100).toFixed(0)}%`);
    console.log(`   Alternatives: ${optimalTime.alternatives.length}`);

    // Test: Create meeting
    console.log('\n📋 Creating test meeting...');
    const meetingData = {
      title: 'WorkflowGenie Test Meeting - DELETE ME',
      description: 'This is a test meeting created by WorkflowGenie. Please delete after testing.',
      start: optimalTime.start,
      end: optimalTime.end,
      timezone: optimalTime.timezone,
      attendees: testAttendees.map(email => ({ email })),
      location: 'Video Conference',
      createVideoCall: true,
      prNumber: '123',
      repository: 'test/repo',
      slackChannel: '#test-channel'
    };

    const createdMeeting = await calendar.createMeeting(
      meetingData,
      testToken,
      'live_test_002'
    );

    console.log('✅ Meeting created successfully!');
    console.log(`   Event ID: ${createdMeeting.id}`);
    console.log(`   Title: ${createdMeeting.title}`);
    console.log(`   Time: ${createdMeeting.start.toLocaleString()} - ${createdMeeting.end.toLocaleString()}`);
    console.log(`   Attendees: ${createdMeeting.attendees.length}`);
    
    if (createdMeeting.videoCall) {
      console.log(`   Video Call: ${createdMeeting.videoCall.joinUrl}`);
    }
    
    if (createdMeeting.htmlLink) {
      console.log(`   Calendar Link: ${createdMeeting.htmlLink}`);
    }

    // Test: Update meeting
    console.log('\n📋 Testing meeting update...');
    const updates = {
      summary: 'WorkflowGenie Test Meeting - UPDATED - DELETE ME',
      description: 'This meeting was updated by WorkflowGenie test. Please delete.'
    };

    const updatedMeeting = await calendar.updateMeeting(
      createdMeeting.id,
      updates,
      testToken,
      'live_test_003'
    );

    console.log('✅ Meeting updated successfully!');
    console.log(`   New title: ${updatedMeeting.summary}`);

    // Optionally delete the test meeting
    const shouldDelete = process.env.AUTO_DELETE_TEST_EVENTS === 'true';
    if (shouldDelete) {
      console.log('\n📋 Cleaning up test meeting...');
      await calendar.deleteMeeting(
        createdMeeting.id,
        testToken,
        'live_test_004',
        false // Don't send deletion notices
      );
      console.log('✅ Test meeting deleted');
    } else {
      console.log('\n⚠️  Test meeting created but not deleted!');
      console.log(`   Event ID: ${createdMeeting.id}`);
      console.log('   Please manually delete this test event from your calendar');
      console.log('   Or set AUTO_DELETE_TEST_EVENTS=true in .env to auto-cleanup');
    }

    console.log('\n🎉 Live Calendar tests completed successfully!');

  } catch (error) {
    console.error('❌ Live test failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.message.includes('No available time slots')) {
      console.log('💡 This is normal - try with different attendee emails or time range');
    }
  } finally {
    await calendar.cleanup();
  }
}

// Test calendar availability analysis
async function testAvailabilityAnalysis() {
  console.log('🧪 Testing Calendar Availability Analysis...\n');

  const calendar = new CalendarConnector();
  await calendar.initialize();

  const testToken = process.env.GOOGLE_CALENDAR_TEST_TOKEN;
  if (!testToken) {
    console.log('❌ Missing GOOGLE_CALENDAR_TEST_TOKEN');
    return;
  }

  try {
    // Mock busy times data (simulating free/busy query response)
    const mockBusyTimes = {
      'user1@company.com': {
        busy: [
          {
            start: '2024-08-31T14:00:00Z',
            end: '2024-08-31T15:00:00Z'
          },
          {
            start: '2024-08-31T16:30:00Z',
            end: '2024-08-31T17:30:00Z'
          }
        ]
      },
      'user2@company.com': {
        busy: [
          {
            start: '2024-08-31T15:00:00Z',
            end: '2024-08-31T16:00:00Z'
          }
        ]
      }
    };

    console.log('📋 Testing busy period merging...');
    const busyPeriods = [
      { start: new Date('2024-08-31T14:00:00Z'), end: new Date('2024-08-31T15:00:00Z') },
      { start: new Date('2024-08-31T14:30:00Z'), end: new Date('2024-08-31T15:30:00Z') }, // Overlapping
      { start: new Date('2024-08-31T16:00:00Z'), end: new Date('2024-08-31T17:00:00Z') }
    ];

    const merged = calendar.mergeBusyPeriods(busyPeriods);
    console.log(`✅ Merged ${busyPeriods.length} periods into ${merged.length}:`);
    merged.forEach((period, i) => {
      console.log(`   ${i + 1}. ${period.start.toISOString()} - ${period.end.toISOString()}`);
    });

    console.log('\n📋 Testing slot scoring...');
    const testSlots = [
      { start: new Date('2024-08-31T09:00:00Z'), end: new Date('2024-08-31T09:30:00Z') }, // Monday 9 AM
      { start: new Date('2024-08-31T14:00:00Z'), end: new Date('2024-08-31T14:30:00Z') }, // Monday 2 PM
      { start: new Date('2024-09-05T17:00:00Z'), end: new Date('2024-09-05T17:30:00Z') }  // Friday 5 PM
    ];

    const optimalSlot = calendar.selectOptimalSlot(testSlots, {});
    console.log('✅ Optimal slot selected:');
    console.log(`   ${optimalSlot.start.toISOString()} - ${optimalSlot.end.toISOString()}`);

    console.log('\n🎉 Availability analysis tests passed!');

  } catch (error) {
    console.error('❌ Availability test failed:', error.message);
  } finally {
    await calendar.cleanup();
  }
}

// Run the appropriate test based on command line argument
if (import.meta.url === `file://${process.argv[1]}`) {
  const testType = process.argv[2] || 'basic';
  
  switch (testType) {
    case 'live':
      await testCalendarLive();
      break;
    case 'availability':
      await testAvailabilityAnalysis();
      break;
    default:
      await testCalendarIntegration();
  }
}