import React, { useState, useEffect } from 'react';
import { Send, BookOpen, Menu, X, FileText, Bell, LogOut, Home, Share2, ThumbsUp, Calendar, Heart, User } from 'lucide-react';

const VHPSCompleteApp = () => {
  // White-label configuration - this would come from a config file or database in production
  const WHITE_LABEL_CONFIG = {
    schoolName: 'Victory Heights Primary School',
    schoolShortName: 'VHPS',
    schoolCity: 'City of Arabia',
    brandColor: '#7f0029', // Burgundy
    accentColor: '#D4AF37', // Gold
    // Wasil branding assets
    wasilIcon: 'https://i.imgur.com/2hYi1Fu.png', // Small icon for header
    wasilLogoGrey: 'https://i.imgur.com/E9IFEnP.png', // Grey logo for footer/login
    wasilLogoWhite: 'https://i.imgur.com/Sl39oRP.png', // White logo for splash screen
    showWasilBranding: true
  };

  const [currentView, setCurrentView] = useState('loading');
  const [userType, setUserType] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [surveyResponses, setSurveyResponses] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventRSVPs, setEventRSVPs] = useState([]);
  const [resources, setResources] = useState([]);
  const [classes, setClasses] = useState(['FS1 Blue', 'Y2 Red', 'Y4 Green']);
  const [parents, setParents] = useState([]);
  const [messageAcknowledgments, setMessageAcknowledgments] = useState([]);
  
  // Parent Pulse state
  const [halfTerms, setHalfTerms] = useState([]);
  const [pulseSurveys, setPulseSurveys] = useState([]);
  const [pulseResponses, setPulseResponses] = useState([]);
  
  // Term Dates state
  const [termDates, setTermDates] = useState([]);
  
  // Daily Schedule state
  const [dailySchedule, setDailySchedule] = useState([]); // One-off events
  const [recurringSchedule, setRecurringSchedule] = useState([]); // Weekly recurring items
  
  // Weekly Headteacher Message state
  const [weeklyMessage, setWeeklyMessage] = useState([]);
  const [weeklyMessageHearts, setWeeklyMessageHearts] = useState([]);
  
  // Knowledge Base state
  const [knowledgeBase, setKnowledgeBase] = useState([]);
  
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');

  const BURGUNDY = WHITE_LABEL_CONFIG.brandColor;
  const GOLD = WHITE_LABEL_CONFIG.accentColor;
  const CREAM = '#eeede7';

  // Core Parent Pulse Questions (stable - do not modify once seeded)
  const PULSE_CORE_QUESTIONS = [
    {
      id: 'q1',
      stable_key: 'core_quality',
      text: 'I feel confident that the school is providing my child with a high-quality education.',
      type: 'LIKERT_5',
      order: 1
    },
    {
      id: 'q2',
      stable_key: 'core_belonging',
      text: 'My child feels happy, safe, and a sense of belonging at school.',
      type: 'LIKERT_5',
      order: 2
    },
    {
      id: 'q3',
      stable_key: 'core_communication',
      text: 'The school communicates clearly and in a timely way.',
      type: 'LIKERT_5',
      order: 3
    },
    {
      id: 'q4',
      stable_key: 'core_responsiveness',
      text: 'When I have a question or concern, I know who to contact and feel listened to.',
      type: 'LIKERT_5',
      order: 4
    },
    {
      id: 'q5',
      stable_key: 'core_expectations',
      text: 'The school\'s expectations for behaviour, learning, and routines are clear and reasonable.',
      type: 'LIKERT_5',
      order: 5
    },
    {
      id: 'q6',
      stable_key: 'core_overall_satisfaction',
      text: 'Overall, I am satisfied with my family\'s experience of the school.',
      type: 'LIKERT_5',
      order: 6
    },
    {
      id: 'q7',
      stable_key: 'core_improve_now',
      text: 'Is there one thing the school could do to improve your experience right now?',
      type: 'TEXT_OPTIONAL',
      order: 7
    }
  ];

  const classColors = {
    'FS1 Blue': { bg: 'bg-blue-500', text: 'text-white' },
    'Y2 Red': { bg: 'bg-red-500', text: 'text-white' },
    'Y4 Green': { bg: 'bg-green-500', text: 'text-white' },
    'Whole School': { bg: 'bg-[#7f0029]', text: 'text-white' }
  };

  useEffect(() => {
    loadData();
    initializePulseData();
    initializeTermDates();
    initializeDailySchedule();
    initializeWeeklyMessage();
    initializeKnowledgeBase();
    // Initialize with sample parent
    setParents([
      { 
        id: 1, 
        name: 'Sarah Williams', 
        email: 'sarah@example.com', 
        children: [
          { name: 'Emma', class: 'FS1 Blue' }, 
          { name: 'Oliver', class: 'Y2 Red' }
        ] 
      }
    ]);
    setTimeout(() => setCurrentView('login'), 2000);
  }, []);

  const loadData = () => {
    setMessages([
      { id: 1, title: 'Welcome Back to Term 2!', content: 'We hope all families had a wonderful break. Term 2 begins Monday, January 13th.', class: 'Whole School', timestamp: new Date('2026-01-10T09:00:00').toISOString(), sender: 'Principal Johnson', actionRequired: { type: 'consent', label: 'Medical Form Required', dueDate: '2026-01-20' } },
      { id: 2, title: 'Swimming Lessons Start Next Week', content: 'Swimming lessons begin Tuesday. Please send swimwear, towel, and goggles.', class: 'Y2 Red', timestamp: new Date('2026-01-11T14:30:00').toISOString(), sender: 'Ms. Thompson', actionRequired: { type: 'payment', label: 'Payment Due', dueDate: '2026-01-17', amount: 'AED 150' } },
      { id: 3, title: 'Show and Tell - Favorite Book', content: 'This Friday is Show and Tell! Please help your child bring their favorite book.', class: 'FS1 Blue', timestamp: new Date('2026-01-12T08:15:00').toISOString(), sender: 'Miss Carter' },
      { id: 4, title: 'Parent Coffee Morning - Friday 9am', content: 'Join us this Friday at 9am in the school hall for our monthly parent coffee morning.', class: 'Whole School', timestamp: new Date('2026-01-12T13:00:00').toISOString(), sender: 'Principal Johnson', actionRequired: { type: 'rsvp', label: 'RSVP Required', dueDate: '2026-01-16' } }
    ]);

    setSurveys([
      { id: 1, question: 'How satisfied are you with the school communication so far this term?', options: ['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied'], active: true, targetClass: 'Whole School' },
      { id: 2, question: 'Is the swimming lesson timing convenient for your family?', options: ['Yes, perfect', 'Yes, manageable', 'No, too early', 'No, too late'], active: true, targetClass: 'Y2 Red' }
    ]);

    setEvents([
      { id: 1, title: 'Parent-Teacher Conferences', description: 'Individual meetings to discuss progress.', date: '2026-01-15', time: '15:00 - 19:00', location: 'Main Hall', targetClass: 'Whole School', requiresRSVP: true },
      { id: 2, title: 'Y2 Swimming Gala', description: 'Annual swimming competition.', date: '2026-01-20', time: '10:00 - 12:00', location: 'Community Pool', targetClass: 'Y2 Red', requiresRSVP: true }
    ]);

    setResources([
      { id: 1, name: 'School Policy Handbook', type: 'PDF' },
      { id: 2, name: 'Term Calendar 2026', type: 'PDF' }
    ]);
  };

  const initializePulseData = () => {
    // Initialize academic year half terms
    const terms = [
      {
        id: 1,
        name: 'Autumn 1',
        academic_year: '2025/26',
        start_date: '2025-09-01',
        end_date: '2025-10-18'
      },
      {
        id: 2,
        name: 'Autumn 2',
        academic_year: '2025/26',
        start_date: '2025-10-28',
        end_date: '2025-12-19'
      },
      {
        id: 3,
        name: 'Spring 1',
        academic_year: '2025/26',
        start_date: '2026-01-06',
        end_date: '2026-02-13'
      },
      {
        id: 4,
        name: 'Spring 2',
        academic_year: '2025/26',
        start_date: '2026-02-24',
        end_date: '2026-04-03'
      }
    ];
    setHalfTerms(terms);

    // Create mock pulse surveys (current one is OPEN, previous one is CLOSED)
    const now = new Date();
    const pulses = [
      {
        id: 1,
        half_term_id: 2,
        half_term_name: 'Autumn 2',
        status: 'CLOSED',
        opens_at: new Date('2025-11-19T19:30:00+04:00').toISOString(),
        closes_at: new Date('2025-11-24T19:30:00+04:00').toISOString(),
        questions: PULSE_CORE_QUESTIONS
      },
      {
        id: 2,
        half_term_id: 3,
        half_term_name: 'Spring 1',
        status: 'OPEN',
        opens_at: new Date('2026-01-21T19:30:00+04:00').toISOString(),
        closes_at: new Date('2026-01-26T19:30:00+04:00').toISOString(),
        questions: PULSE_CORE_QUESTIONS
      }
    ];
    setPulseSurveys(pulses);

    // Add some mock responses for the closed pulse (for trend analysis)
    const mockResponses = [];
    for (let i = 0; i < 15; i++) {
      mockResponses.push({
        id: i + 1,
        pulse_survey_id: 1,
        parent_user_id: `parent${i}@example.com`,
        submitted_at: new Date('2025-11-20T20:00:00+04:00').toISOString(),
        answers: {
          q1: Math.floor(Math.random() * 2) + 4, // 4-5
          q2: Math.floor(Math.random() * 2) + 4,
          q3: Math.floor(Math.random() * 3) + 3, // 3-5
          q4: Math.floor(Math.random() * 3) + 3,
          q5: Math.floor(Math.random() * 2) + 4,
          q6: Math.floor(Math.random() * 2) + 4,
          q7: i % 3 === 0 ? 'More outdoor play time would be great.' : ''
        }
      });
    }
    setPulseResponses(mockResponses);
  };

  const initializeTermDates = () => {
    // Initialize term dates based on 2025/26 calendar
    const dates = [
      // Term 1 (Winter Term)
      { id: 1, term: 1, termName: 'Term 1 (Winter Term)', label: 'Induction Day', sublabel: 'Families in school, scheduled appointments', date: '2025-08-22', type: 'induction', color: 'purple' },
      { id: 2, term: 1, termName: 'Term 1 (Winter Term)', label: 'Term 1 starts', date: '2025-08-25', type: 'term-start', color: 'burgundy' },
      { id: 3, term: 1, termName: 'Term 1 (Winter Term)', label: 'Half term', date: '2025-10-13', endDate: '2025-10-17', type: 'half-term', color: 'blue' },
      { id: 4, term: 1, termName: 'Term 1 (Winter Term)', label: 'Commemoration Day & UAE National Day', sublabel: 'Public holiday', date: '2025-12-01', endDate: '2025-12-03', type: 'public-holiday', color: 'green' },
      { id: 5, term: 1, termName: 'Term 1 (Winter Term)', label: 'End of Term 1', date: '2025-12-05', type: 'term-end', color: 'burgundy' },
      
      // Term 2
      { id: 6, term: 2, termName: 'Term 2', label: 'Term 2 starts', date: '2026-01-05', type: 'term-start', color: 'burgundy' },
      { id: 7, term: 2, termName: 'Term 2', label: 'Ramadan begins', sublabel: 'Public holiday (subject to confirmation)', date: '2026-02-16', type: 'public-holiday', color: 'green' },
      { id: 8, term: 2, termName: 'Term 2', label: 'End of Term 2', date: '2026-03-13', type: 'term-end', color: 'burgundy' },
      { id: 9, term: 2, termName: 'Term 2', label: 'Eid al Fitr', sublabel: 'Public holiday (subject to confirmation)', date: '2026-03-19', endDate: '2026-03-20', type: 'public-holiday', color: 'green' },
      
      // Term 3
      { id: 10, term: 3, termName: 'Term 3', label: 'Term 3 starts', date: '2026-03-30', type: 'term-start', color: 'burgundy' },
      { id: 11, term: 3, termName: 'Term 3', label: 'Arafat Day & Eid al Adha', sublabel: 'Public holiday (subject to confirmation)', date: '2026-05-26', endDate: '2026-05-29', type: 'public-holiday', color: 'green' },
      { id: 12, term: 3, termName: 'Term 3', label: 'Islamic New Year', sublabel: 'Public holiday (subject to confirmation)', date: '2026-06-16', type: 'public-holiday', color: 'green' },
      { id: 13, term: 3, termName: 'Term 3', label: 'End of Term 3', date: '2026-07-03', type: 'term-end', color: 'burgundy' }
    ];
    setTermDates(dates);
  };

  const initializeDailySchedule = () => {
    // Get today's date and create relative dates
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0];
    
    // Recurring weekly schedule - set once, applies every week
    const recurring = [
      {
        id: 1,
        class: 'FS1 Blue',
        dayOfWeek: 3, // Wednesday (0=Sunday, 1=Monday, etc.)
        type: 'pe',
        label: 'PE Day',
        description: 'Please wear PE kit',
        icon: '🏃',
        active: true
      },
      {
        id: 2,
        class: 'Y2 Red',
        dayOfWeek: 2, // Tuesday
        type: 'swimming',
        label: 'Swimming Lesson',
        description: 'Remember swimwear, towel & goggles',
        icon: '🏊',
        active: true
      },
      {
        id: 3,
        class: 'Y4 Green',
        dayOfWeek: 4, // Thursday
        type: 'pe',
        label: 'PE Day',
        description: 'Please wear PE kit',
        icon: '🏃',
        active: true
      }
    ];
    setRecurringSchedule(recurring);

    // One-off events (date-specific)
    const oneOffEvents = [
      {
        id: 1,
        class: 'Whole School',
        date: todayStr, // Today
        type: 'early-finish',
        label: 'Early Finish',
        description: 'School ends at 1:00pm for staff training',
        icon: '🕐'
      },
      {
        id: 2,
        class: 'Y4 Green',
        date: tomorrowStr, // Tomorrow
        type: 'trip',
        label: 'Field Trip',
        description: 'Museum of the Future - packed lunch needed',
        icon: '🚌'
      },
      {
        id: 3,
        class: 'Whole School',
        date: dayAfterTomorrowStr, // Day after tomorrow
        type: 'non-uniform',
        label: 'Non-Uniform Day',
        description: 'Dress comfortably for charity fundraiser',
        icon: '👕'
      }
    ];
    setDailySchedule(oneOffEvents);
  };

  const initializeWeeklyMessage = () => {
    // Initialize with multiple weeks of messages
    const today = new Date();
    
    // Current week
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay() + 1);
    
    // Last week
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    
    // Two weeks ago
    const twoWeeksStart = new Date(thisWeekStart);
    twoWeeksStart.setDate(twoWeeksStart.getDate() - 14);
    
    const messages = [
      {
        id: 1,
        title: "Principal's Weekly Update",
        content: "Hello VHPS Families! 👋\n\nWhat an amazing week we've had! Our Year 2 swimmers are doing brilliantly - I popped down to watch them yesterday and the progress is incredible. So proud of every single one of them! 🏊\n\nThis Friday we're celebrating our maths superstars in assembly - it's always one of my favourite moments seeing the children's faces light up when they're recognized.\n\nQuick reminder: Coffee morning this Friday at 9am in the hall. Come grab a cuppa and say hi! ☕\n\nHave a wonderful rest of the week!\n\nBen\nPrincipal",
        date: thisWeekStart.toISOString(),
        weekOf: thisWeekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        isCurrent: true
      },
      {
        id: 2,
        title: "Principal's Weekly Update",
        content: "Happy Monday, VHPS! 🌟\n\nWhat a start to the new year! The energy around school has been fantastic. Our FS1 students have settled in beautifully after the break - their smiles make everything worthwhile!\n\nBig shoutout to our Year 4s who organized a book swap last week. The initiative and kindness they showed was wonderful to see. 📚\n\nLooking ahead: Sports Day planning is underway! More details coming soon, but mark your calendars for late February.\n\nStay warm this week!\n\nBen\nPrincipal",
        date: lastWeekStart.toISOString(),
        weekOf: lastWeekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        isCurrent: false
      },
      {
        id: 3,
        title: "Principal's Weekly Update",
        content: "Hello families! 🎉\n\nWelcome back from the break! Hope everyone had a restful time and the kids are ready for Term 2. We've got some exciting things planned.\n\nOur new library books have arrived and the children are already diving in. Nothing beats seeing young readers get excited about new stories! 📖\n\nFriendly reminder: Swimming lessons start next week for Year 2. Please check the kit list that went out last term.\n\nLet's make this a great term!\n\nBen\nPrincipal",
        date: twoWeeksStart.toISOString(),
        weekOf: twoWeeksStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        isCurrent: false
      }
    ];
    
    setWeeklyMessage(messages);
  };

  const initializeKnowledgeBase = () => {
    const kb = [
      {
        id: 1,
        category: 'The School Day',
        icon: '🕐',
        color: 'blue',
        articles: [
          {
            id: 101,
            title: 'School Timings',
            content: "**School Day Hours:**\n\nFS1 & FS2:\n• 7:45am - 1:45pm (Sunday to Thursday)\n\nYear 1 to Year 6:\n• 7:45am - 2:45pm (Sunday to Thursday)\n\n**Drop-off:** Gates open at 7:30am\n**Pick-up:** Gates open 15 minutes before end time\n\nLate arrivals must report to reception.",
            lastUpdated: '2026-01-10'
          },
          {
            id: 102,
            title: 'Break & Lunch Times',
            content: "**Morning Break:**\n• FS1/FS2: 10:00-10:20am\n• Y1-Y6: 10:15-10:35am\n\n**Lunch:**\n• FS1/FS2: 12:00-12:45pm\n• Y1-Y3: 12:15-1:00pm\n• Y4-Y6: 12:30-1:15pm\n\nHealthy snacks encouraged for break time.",
            lastUpdated: '2026-01-10'
          },
          {
            id: 103,
            title: 'Attendance & Absences',
            content: "**Reporting Absences:**\n• Email: attendance@vhps.ae\n• Call: +971 4 xxx xxxx before 8:00am\n\n**Medical Appointments:**\nPlease notify us in advance. Medical certificates required for absences over 3 days.\n\n**Punctuality:**\nConsistent late arrivals will require a meeting with the Principal.",
            lastUpdated: '2026-01-05'
          }
        ]
      },
      {
        id: 2,
        category: 'Uniform & Equipment',
        icon: '👔',
        color: 'purple',
        articles: [
          {
            id: 201,
            title: 'School Uniform Policy',
            content: "**Daily Uniform:**\n• Burgundy polo shirt with VHPS logo\n• Navy blue shorts/skort/trousers\n• Black school shoes (no trainers)\n• VHPS cap (outdoor activities)\n\n**PE Kit:**\n• Gold VHPS PE shirt\n• Navy blue shorts\n• White trainers\n\n**Winter Months:**\nBurgundy fleece available from uniform shop.",
            lastUpdated: '2026-01-08'
          },
          {
            id: 202,
            title: 'Required Equipment',
            content: "**Every Day:**\n• Named water bottle\n• Sun hat (outdoor play)\n• Reading folder\n\n**PE Days:**\n• Full PE kit in named bag\n\n**Swimming (Y2):**\n• Swimsuit/trunks\n• Towel\n• Goggles (optional)\n• Swimming cap\n\nAll items must be clearly labeled with your child's name.",
            lastUpdated: '2026-01-08'
          }
        ]
      },
      {
        id: 3,
        category: 'Behaviour & Expectations',
        icon: '⭐',
        color: 'yellow',
        articles: [
          {
            id: 301,
            title: 'School Values',
            content: "**Our Core Values:**\n\n🌟 **Respect** - For ourselves, others, and our environment\n\n💪 **Resilience** - Perseverance through challenges\n\n🤝 **Responsibility** - Taking ownership of our actions\n\n❤️ **Kindness** - Compassion and empathy for all\n\nThese values guide everything we do at VHPS.",
            lastUpdated: '2025-09-01'
          },
          {
            id: 302,
            title: 'Positive Behaviour System',
            content: "**House Points:**\nChildren earn house points for demonstrating our values. Points are totaled weekly with celebrations each Friday.\n\n**Golden Time:**\nFriday afternoons - special activities for consistent positive behavior.\n\n**Star of the Week:**\nOne child per class recognized each week in assembly.\n\n**Principal's Award:**\nExceptional achievements recognized with certificate and visit to Principal's office.",
            lastUpdated: '2025-09-15'
          },
          {
            id: 303,
            title: 'Behaviour Expectations',
            content: "**Expected Behaviours:**\n• Follow instructions first time\n• Keep hands, feet and objects to ourselves\n• Use kind words and actions\n• Walk in corridors\n• Listen when others are speaking\n\n**Consequences:**\n1. Verbal warning\n2. Time out in class\n3. Loss of break time\n4. Meeting with Principal\n5. Parent meeting\n\nSerious incidents (violence, bullying) escalate immediately.",
            lastUpdated: '2025-09-01'
          }
        ]
      },
      {
        id: 4,
        category: 'Assessment & Reporting',
        icon: '📊',
        color: 'green',
        articles: [
          {
            id: 401,
            title: 'Assessment Schedule',
            content: "**Ongoing Assessment:**\nTeachers assess daily through observations, classwork, and discussions.\n\n**Formal Assessments:**\n• **Autumn Term:** Baseline assessments (Sept/Oct)\n• **Spring Term:** Progress checks (Jan/Feb)\n• **Summer Term:** End of year assessments (May/June)\n\n**External Tests:**\n• Year 2: Phonics screening\n• Year 6: End of Key Stage assessments",
            lastUpdated: '2025-12-05'
          },
          {
            id: 402,
            title: 'Reports & Parents Evenings',
            content: "**Parent-Teacher Consultations:**\n• Autumn Term: November\n• Spring Term: March\n• Available via online booking\n\n**Written Reports:**\n• Mid-year: February (progress update)\n• End of year: July (full report)\n\n**Additional Meetings:**\nAvailable upon request - contact your child's teacher via email.",
            lastUpdated: '2025-11-20'
          }
        ]
      },
      {
        id: 5,
        category: 'Inclusion & Support',
        icon: '🤲',
        color: 'teal',
        articles: [
          {
            id: 501,
            title: 'Learning Support',
            content: "**SENCO Support:**\nOur Special Educational Needs Coordinator works with children requiring additional support.\n\n**Interventions:**\n• Small group phonics\n• Numeracy support\n• Speech & language therapy\n• Social skills groups\n\n**External Assessments:**\nWe can recommend educational psychologists if needed.\n\nContact: senco@vhps.ae",
            lastUpdated: '2025-10-15'
          },
          {
            id: 502,
            title: 'English as Additional Language (EAL)',
            content: "**EAL Support:**\nWe welcome children from all linguistic backgrounds.\n\n**Support Provided:**\n• In-class support\n• Small group sessions\n• Visual aids and resources\n• Buddy system\n• Translation services (major languages)\n\nProgress is monitored closely in partnership with parents.",
            lastUpdated: '2025-09-10'
          }
        ]
      },
      {
        id: 6,
        category: 'Safeguarding & Wellbeing',
        icon: '🛡️',
        color: 'red',
        articles: [
          {
            id: 601,
            title: 'Safeguarding Policy',
            content: "**Child Protection:**\nAll staff are DBS checked and safeguarding trained.\n\n**Designated Safeguarding Leads:**\n• Mr. Ben Johnson (Principal)\n• Ms. Sarah Ahmed (Deputy)\n\n**Reporting Concerns:**\nIf you have any concerns about a child's welfare, contact our DSL immediately.\n\nEmail: safeguarding@vhps.ae\nPhone: +971 4 xxx xxxx",
            lastUpdated: '2026-01-05'
          },
          {
            id: 602,
            title: 'Health & Medical',
            content: "**School Nurse:**\nAvailable Monday-Thursday, 8:00am-2:00pm\n\n**Medications:**\nPrescription medications can be administered with completed consent forms.\n\n**Allergies:**\nMust be registered with the school nurse and class teacher.\n\n**First Aid:**\nAll teaching assistants are first-aid trained.\n\n**Emergency Contact:**\nEnsure details are always up to date.",
            lastUpdated: '2025-12-10'
          },
          {
            id: 603,
            title: 'Mental Health & Wellbeing',
            content: "**Wellbeing Support:**\n• School counselor available (by referral)\n• Mindfulness sessions\n• Worry boxes in each classroom\n• Peer mentoring program\n\n**Parent Resources:**\nWorkshops offered termly on topics like anxiety, resilience, and digital wellbeing.\n\n**External Support:**\nWe can recommend external counseling services if needed.",
            lastUpdated: '2025-11-25'
          }
        ]
      },
      {
        id: 7,
        category: 'Fees, Payments & Transport',
        icon: '💳',
        color: 'orange',
        articles: [
          {
            id: 701,
            title: 'Fee Structure',
            content: "**Annual Fees (2025/26):**\n• FS1: AED 45,000\n• FS2: AED 48,000\n• Year 1-2: AED 52,000\n• Year 3-4: AED 56,000\n• Year 5-6: AED 60,000\n\n**Payment Terms:**\n• Termly installments available\n• 5% sibling discount (2nd child onwards)\n• Payment due by term start date\n\n**Registration Fee:**\nAED 1,000 (non-refundable)",
            lastUpdated: '2025-08-20'
          },
          {
            id: 702,
            title: 'Payment Methods',
            content: "**Accepted Payment Methods:**\n• Bank transfer (preferred)\n• Credit/debit card (via parent portal)\n• Post-dated cheques\n\n**Bank Details:**\nBank: Emirates NBD\nAccount Name: Victory Heights Primary School\nIBAN: AE07 0XXX XXXX XXXX XXXX XXX\n\n**Late Payment:**\nAED 500 fee applies after 14 days.",
            lastUpdated: '2025-08-20'
          },
          {
            id: 703,
            title: 'School Transport',
            content: "**Bus Service:**\nOperated by Safe Transport LLC\n\n**Routes Cover:**\n• Arabian Ranches\n• Motor City  \n• Sports City\n• Victory Heights\n• Dubai Sports City\n\n**Fees:**\nAED 6,000 per year (one way)\nAED 10,000 per year (two way)\n\n**Registration:**\nContact: transport@safetransport.ae\nPhone: +971 4 xxx xxxx",
            lastUpdated: '2025-09-05'
          }
        ]
      }
    ];
    setKnowledgeBase(kb);
  };

  const handleAddKBArticle = (categoryId, articleData) => {
    setKnowledgeBase(knowledgeBase.map(cat => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          articles: [...cat.articles, { id: Date.now(), ...articleData, lastUpdated: new Date().toISOString().split('T')[0] }]
        };
      }
      return cat;
    }));
  };

  const handleUpdateKBArticle = (categoryId, articleId, updatedData) => {
    setKnowledgeBase(knowledgeBase.map(cat => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          articles: cat.articles.map(art => 
            art.id === articleId ? { ...art, ...updatedData, lastUpdated: new Date().toISOString().split('T')[0] } : art
          )
        };
      }
      return cat;
    }));
  };

  const handleDeleteKBArticle = (categoryId, articleId) => {
    setKnowledgeBase(knowledgeBase.map(cat => {
      if (cat.id === categoryId) {
        return {
          ...cat,
          articles: cat.articles.filter(art => art.id !== articleId)
        };
      }
      return cat;
    }));
  };

  const handleWeeklyMessageHeart = (messageId) => {
    const newHeart = {
      id: Date.now(),
      messageId,
      userId: currentUser.email,
      userName: currentUser.name,
      timestamp: new Date().toISOString()
    };
    setWeeklyMessageHearts([...weeklyMessageHearts, newHeart]);
  };

  // Recurring Schedule Handlers
  const handleAddRecurringItem = (itemData) => {
    const newItem = { id: Date.now(), ...itemData, active: true };
    setRecurringSchedule([...recurringSchedule, newItem]);
  };

  const handleToggleRecurringItem = (id) => {
    setRecurringSchedule(recurringSchedule.map(item => 
      item.id === id ? { ...item, active: !item.active } : item
    ));
  };

  const handleDeleteRecurringItem = (id) => {
    setRecurringSchedule(recurringSchedule.filter(item => item.id !== id));
  };

  // Helper function to check if a date is a school day (not weekend, not half-term, not public holiday)
  const isSchoolDay = (dateStr) => {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    
    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    
    // Check if within any term dates and not during half-term or public holiday
    const dateTime = date.getTime();
    
    // Check term dates for half-terms and public holidays
    const isHalfTerm = termDates.some(td => {
      if (td.type === 'half-term' || td.type === 'public-holiday') {
        const start = new Date(td.date).getTime();
        const end = td.endDate ? new Date(td.endDate).getTime() : start;
        return dateTime >= start && dateTime <= end;
      }
      return false;
    });
    
    return !isHalfTerm;
  };

  // Get combined schedule for a specific date (recurring + one-off)
  const getScheduleForDate = (dateStr) => {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    
    // Get one-off events for this date
    const oneOffItems = dailySchedule.filter(item => item.date === dateStr);
    
    // Get recurring items for this day of week (only if it's a school day)
    const recurringItems = isSchoolDay(dateStr)
      ? recurringSchedule
          .filter(item => item.active && item.dayOfWeek === dayOfWeek)
          .map(item => ({
            ...item,
            date: dateStr,
            isRecurring: true
          }))
      : [];
    
    return [...recurringItems, ...oneOffItems];
  };

  const handleAddScheduleItem = (itemData) => {
    const newItem = { id: Date.now(), ...itemData };
    setDailySchedule([...dailySchedule, newItem].sort((a, b) => new Date(a.date) - new Date(b.date)));
  };

  const handleUpdateScheduleItem = (id, updatedData) => {
    setDailySchedule(dailySchedule.map(item => item.id === id ? { ...item, ...updatedData } : item));
  };

  const handleDeleteScheduleItem = (id) => {
    setDailySchedule(dailySchedule.filter(item => item.id !== id));
  };

  const handleAddTermDate = (dateData) => {
    const newDate = { id: Date.now(), ...dateData };
    setTermDates([...termDates, newDate].sort((a, b) => new Date(a.date) - new Date(b.date)));
  };

  const handleUpdateTermDate = (id, updatedData) => {
    setTermDates(termDates.map(d => d.id === id ? { ...d, ...updatedData } : d).sort((a, b) => new Date(a.date) - new Date(b.date)));
  };

  const handleDeleteTermDate = (id) => {
    setTermDates(termDates.filter(d => d.id !== id));
  };

  const handleSubmitPulse = (pulseId, answers) => {
    const newResponse = {
      id: Date.now(),
      pulse_survey_id: pulseId,
      parent_user_id: currentUser.email,
      submitted_at: new Date().toISOString(),
      answers
    };
    setPulseResponses([...pulseResponses, newResponse]);
  };

  const handleSendPulseNow = (pulseId) => {
    setPulseSurveys(pulseSurveys.map(p => 
      p.id === pulseId 
        ? { ...p, status: 'OPEN', opens_at: new Date().toISOString() }
        : p
    ));
  };

  const handleClosePulseNow = (pulseId) => {
    setPulseSurveys(pulseSurveys.map(p => 
      p.id === pulseId 
        ? { ...p, status: 'CLOSED', closes_at: new Date().toISOString() }
        : p
    ));
  };

  const handleLogin = (type, userData) => {
    setUserType(type);
    setCurrentUser(userData);
    setCurrentView(type === 'admin' ? 'admin' : 'parent');
  };

  const handleSendMessage = (messageData) => {
    const { hasAction, actionType, actionLabel, actionDueDate, actionAmount, ...coreData } = messageData;
    
    const newMessage = { 
      id: Date.now(), 
      ...coreData, 
      timestamp: new Date().toISOString(), 
      sender: currentUser.name 
    };
    
    // Add action required if specified
    if (hasAction && actionDueDate) {
      newMessage.actionRequired = {
        type: actionType,
        label: actionLabel || (actionType === 'payment' ? 'Payment Due' : actionType === 'consent' ? 'Consent Form Required' : 'RSVP Required'),
        dueDate: actionDueDate,
        ...(actionType === 'payment' && actionAmount ? { amount: actionAmount } : {})
      };
    }
    
    setMessages([newMessage, ...messages]);
  };

  const handleCreateSurvey = (surveyData) => {
    const newSurvey = { id: Date.now(), ...surveyData, active: true, createdAt: new Date().toISOString() };
    setSurveys([newSurvey, ...surveys]);
  };

  const handleCreateEvent = (eventData) => {
    const newEvent = { id: Date.now(), ...eventData };
    setEvents([newEvent, ...events]);
  };

  const handleBulkImportEvents = (csvData) => {
    // Parse CSV and create multiple events
    const lines = csvData.trim().split('\n');
    const newEvents = [];
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line (handles commas in quotes)
      const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(col => col.replace(/^"|"$/g, '').trim());
      
      if (cols.length >= 5) {
        const [title, description, date, time, location, targetClass, requiresRSVP] = cols;
        
        newEvents.push({
          id: Date.now() + i,
          title,
          description: description || '',
          date,
          time: time || '',
          location: location || '',
          targetClass: targetClass || 'Whole School',
          requiresRSVP: requiresRSVP?.toLowerCase() === 'yes' || requiresRSVP?.toLowerCase() === 'true'
        });
      }
    }
    
    if (newEvents.length > 0) {
      setEvents([...newEvents, ...events]);
      return newEvents.length;
    }
    return 0;
  };

  const handleSurveyResponse = (surveyId, response) => {
    const newResponse = { id: Date.now(), surveyId, userId: currentUser.email, userName: currentUser.name, response, timestamp: new Date().toISOString() };
    setSurveyResponses([...surveyResponses, newResponse]);
  };

  const handleEventRSVP = (eventId, status) => {
    const existing = eventRSVPs.find(r => r.eventId === eventId && r.userId === currentUser.email);
    if (existing) {
      setEventRSVPs(eventRSVPs.map(r => r.eventId === eventId && r.userId === currentUser.email ? { ...r, status, timestamp: new Date().toISOString() } : r));
    } else {
      setEventRSVPs([...eventRSVPs, { id: Date.now(), eventId, userId: currentUser.email, userName: currentUser.name, status, timestamp: new Date().toISOString() }]);
    }
  };

  const handleAddClass = (className) => {
    if (className && !classes.includes(className)) {
      setClasses([...classes, className]);
    }
  };

  const handleDeleteClass = (className) => {
    setClasses(classes.filter(c => c !== className));
  };

  const handleAddParent = (parentData) => {
    const newParent = { id: Date.now(), ...parentData };
    setParents([...parents, newParent]);
  };

  const handleUpdateParent = (parentId, updatedData) => {
    setParents(parents.map(p => p.id === parentId ? { ...p, ...updatedData } : p));
  };

  const handleDeleteParent = (parentId) => {
    setParents(parents.filter(p => p.id !== parentId));
  };

  const handleMessageAcknowledgment = (messageId) => {
    const newAck = {
      id: Date.now(),
      messageId,
      userId: currentUser.email,
      userName: currentUser.name,
      timestamp: new Date().toISOString()
    };
    setMessageAcknowledgments([...messageAcknowledgments, newAck]);
  };

  const handleLogout = () => {
    setUserType(null);
    setCurrentUser(null);
    setCurrentView('login');
    setMenuOpen(false);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: CREAM }}>
      {currentView === 'loading' && <LoadingScreen burgundy={BURGUNDY} gold={GOLD} config={WHITE_LABEL_CONFIG} />}
      
      {currentView !== 'loading' && (
        <>
          <header style={{ backgroundColor: BURGUNDY, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div style={{ backgroundColor: 'white', padding: '8px', borderRadius: '8px' }}>
                  {WHITE_LABEL_CONFIG.wasilIcon ? (
                    <img src={WHITE_LABEL_CONFIG.wasilIcon} alt="Wasil" style={{ height: '32px', width: '32px' }} />
                  ) : (
                    <BookOpen style={{ height: '32px', width: '32px', color: BURGUNDY }} />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">{WHITE_LABEL_CONFIG.schoolName}</h1>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm" style={{ color: GOLD }}>{WHITE_LABEL_CONFIG.schoolCity} • Stay Connected</p>
                    {WHITE_LABEL_CONFIG.showWasilBranding && (
                      <>
                        <span className="text-xs text-white opacity-50">•</span>
                        <p className="text-xs text-white opacity-70">powered by Wasil</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {currentUser && (
                <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-lg text-white hover:bg-white hover:bg-opacity-10">
                  {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </button>
              )}
            </div>
          </header>

          {menuOpen && currentUser && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setMenuOpen(false)}>
              <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold" style={{ color: BURGUNDY }}>Menu</h2>
                    <button onClick={() => setMenuOpen(false)}><X className="h-6 w-6 text-gray-500" /></button>
                  </div>
                  <div className="space-y-2">
                    <button onClick={() => { setCurrentView(userType === 'admin' ? 'admin' : 'parent'); setMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100">
                      <Home className="h-5 w-5 text-gray-600" />
                      <span className="text-gray-700">Home</span>
                    </button>
                    <button onClick={() => { setCurrentView('events'); setMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100">
                      <Bell className="h-5 w-5 text-gray-600" />
                      <span className="text-gray-700">Events Calendar</span>
                    </button>
                    <button onClick={() => { setCurrentView('term-dates'); setMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100">
                      <Calendar className="h-5 w-5 text-gray-600" />
                      <span className="text-gray-700">Term Dates</span>
                    </button>
                    <button onClick={() => { setCurrentView('principal-updates'); setMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100">
                      <User className="h-5 w-5 text-gray-600" />
                      <span className="text-gray-700">Principal's Updates</span>
                    </button>
                    <button onClick={() => { setCurrentView('knowledge-base'); setMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100">
                      <BookOpen className="h-5 w-5 text-gray-600" />
                      <span className="text-gray-700">School Information</span>
                    </button>
                    <button onClick={() => { setCurrentView('resources'); setMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-100">
                      <FileText className="h-5 w-5 text-gray-600" />
                      <span className="text-gray-700">Files & Policies</span>
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-red-50 text-red-600">
                      <LogOut className="h-5 w-5" />
                      <span>Logout</span>
                    </button>
                  </div>
                  {currentUser.children && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <p className="text-sm font-semibold mb-2" style={{ color: BURGUNDY }}>My Children:</p>
                      {currentUser.children.map((child, idx) => (
                        <div key={idx} className="text-sm text-gray-600 mb-1">
                          {child.name} - {child.class}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <main className="max-w-7xl mx-auto px-4 py-8">
            {currentView === 'login' && <LoginView onLogin={handleLogin} burgundy={BURGUNDY} gold={GOLD} config={WHITE_LABEL_CONFIG} />}
            {currentView === 'parent' && (
              <ParentView 
                messages={messages}
                surveys={surveys}
                surveyResponses={surveyResponses}
                onSurveyResponse={handleSurveyResponse}
                currentUser={currentUser}
                classColors={classColors}
                selectedClassFilter={selectedClassFilter}
                onClassFilterChange={setSelectedClassFilter}
                burgundy={BURGUNDY}
                messageAcknowledgments={messageAcknowledgments}
                onMessageAcknowledgment={handleMessageAcknowledgment}
                pulseSurveys={pulseSurveys}
                pulseResponses={pulseResponses}
                onSubmitPulse={handleSubmitPulse}
                getScheduleForDate={getScheduleForDate}
                weeklyMessage={weeklyMessage}
                weeklyMessageHearts={weeklyMessageHearts}
                onWeeklyMessageHeart={handleWeeklyMessageHeart}
              />
            )}
            {currentView === 'admin' && (
              <AdminView 
                messages={messages}
                surveys={surveys}
                surveyResponses={surveyResponses}
                events={events}
                eventRSVPs={eventRSVPs}
                classes={classes}
                parents={parents}
                onSendMessage={handleSendMessage}
                onCreateSurvey={handleCreateSurvey}
                onCreateEvent={handleCreateEvent}
                onBulkImportEvents={handleBulkImportEvents}
                onAddClass={handleAddClass}
                onDeleteClass={handleDeleteClass}
                onAddParent={handleAddParent}
                onUpdateParent={handleUpdateParent}
                onDeleteParent={handleDeleteParent}
                classColors={classColors}
                burgundy={BURGUNDY}
                gold={GOLD}
                pulseSurveys={pulseSurveys}
                pulseResponses={pulseResponses}
                halfTerms={halfTerms}
                onSendPulseNow={handleSendPulseNow}
                onClosePulseNow={handleClosePulseNow}
                dailySchedule={dailySchedule}
                recurringSchedule={recurringSchedule}
                onAddScheduleItem={handleAddScheduleItem}
                onUpdateScheduleItem={handleUpdateScheduleItem}
                onDeleteScheduleItem={handleDeleteScheduleItem}
                onAddRecurringItem={handleAddRecurringItem}
                onToggleRecurringItem={handleToggleRecurringItem}
                onDeleteRecurringItem={handleDeleteRecurringItem}
              />
            )}
            {currentView === 'events' && (
              <EventsView 
                events={events}
                currentUser={currentUser}
                classColors={classColors}
                eventRSVPs={eventRSVPs}
                onEventRSVP={handleEventRSVP}
                burgundy={BURGUNDY}
                gold={GOLD}
              />
            )}
            {currentView === 'term-dates' && (
              <TermDatesView 
                termDates={termDates}
                burgundy={BURGUNDY}
                gold={GOLD}
                userType={userType}
                onAddTermDate={handleAddTermDate}
                onUpdateTermDate={handleUpdateTermDate}
                onDeleteTermDate={handleDeleteTermDate}
              />
            )}
            {currentView === 'principal-updates' && (
              <PrincipalUpdatesView
                weeklyMessages={weeklyMessage}
                weeklyMessageHearts={weeklyMessageHearts}
                onWeeklyMessageHeart={handleWeeklyMessageHeart}
                currentUser={currentUser}
                burgundy={BURGUNDY}
              />
            )}
            {currentView === 'knowledge-base' && (
              <KnowledgeBaseView
                knowledgeBase={knowledgeBase}
                burgundy={BURGUNDY}
                userType={userType}
                onAddArticle={handleAddKBArticle}
                onUpdateArticle={handleUpdateKBArticle}
                onDeleteArticle={handleDeleteKBArticle}
              />
            )}
            {currentView === 'resources' && <ResourcesView resources={resources} burgundy={BURGUNDY} />}
          </main>

          {/* Wasil Footer */}
          {WHITE_LABEL_CONFIG.showWasilBranding && (
            <footer className="py-4 border-t border-gray-200 bg-white">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-xs text-gray-500">
                    © {new Date().getFullYear()} {WHITE_LABEL_CONFIG.schoolName}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-400">powered by</span>
                  {WHITE_LABEL_CONFIG.wasilLogoGrey ? (
                    <img 
                      src={WHITE_LABEL_CONFIG.wasilLogoGrey} 
                      alt="Wasil" 
                      className="h-4 opacity-60"
                    />
                  ) : (
                    <span className="text-sm font-light tracking-wide text-gray-600">Wasil</span>
                  )}
                </div>
              </div>
            </footer>
          )}
        </>
      )}
    </div>
  );
};

const LoadingScreen = ({ burgundy, gold, config }) => (
  <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: burgundy }}>
    <div className="text-center">
      <div className="mb-8">
        <div className="mx-auto w-48 h-48 rounded-full flex items-center justify-center" style={{ backgroundColor: gold }}>
          <div className="text-center">
            <div className="text-6xl font-bold" style={{ color: burgundy }}>{config.schoolShortName.substring(0, 2)}</div>
            <div className="text-sm font-semibold mt-1" style={{ color: burgundy }}>{config.schoolShortName}</div>
          </div>
        </div>
      </div>
      <h1 className="text-3xl font-bold text-white mb-2">{config.schoolName}</h1>
      <p className="text-xl mb-8" style={{ color: gold }}>{config.schoolCity}</p>
      
      {/* Wasil Logo */}
      {config.wasilLogoWhite && config.showWasilBranding && (
        <div className="mb-6 flex justify-center">
          <img 
            src={config.wasilLogoWhite} 
            alt="Wasil" 
            className="h-10 opacity-90"
          />
        </div>
      )}
      
      <div className="flex justify-center">
        <div className="w-16 h-16 border-4 rounded-full animate-spin" style={{ borderColor: gold, borderTopColor: 'transparent' }}></div>
      </div>
      <p className="mt-6 text-sm" style={{ color: gold }}>Loading your school portal...</p>
    </div>
  </div>
);

const LoginView = ({ onLogin, burgundy, gold, config }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8" style={{ borderTop: `4px solid ${burgundy}` }}>
        <div className="text-center mb-6">
          <div className="mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: gold }}>
            <div className="text-3xl font-bold" style={{ color: burgundy }}>{config.schoolShortName.substring(0, 2)}</div>
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: burgundy }}>Welcome Back</h2>
          <p className="text-sm" style={{ color: burgundy, opacity: 0.7 }}>{config.schoolName}</p>
          
          {/* Wasil branding */}
          {config.showWasilBranding && (
            <div className="mt-4 flex items-center justify-center space-x-2">
              <span className="text-xs text-gray-400">powered by</span>
              {config.wasilLogoGrey ? (
                <img 
                  src={config.wasilLogoGrey} 
                  alt="Wasil" 
                  className="h-4 opacity-50"
                />
              ) : (
                <span className="text-sm font-light tracking-wide text-gray-500">Wasil</span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex space-x-2 mb-6">
          <button 
            onClick={() => setIsAdmin(false)} 
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '8px',
              fontWeight: '500',
              cursor: 'pointer',
              border: `2px solid ${!isAdmin ? burgundy : gold}`,
              backgroundColor: !isAdmin ? burgundy : 'white',
              color: !isAdmin ? 'white' : burgundy
            }}
          >
            Parent
          </button>
          <button 
            onClick={() => setIsAdmin(true)} 
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '8px',
              fontWeight: '500',
              cursor: 'pointer',
              border: `2px solid ${isAdmin ? burgundy : gold}`,
              backgroundColor: isAdmin ? burgundy : 'white',
              color: isAdmin ? 'white' : burgundy
            }}
          >
            Admin
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{ border: `2px solid ${gold}` }}
              placeholder="your.email@example.com" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{ border: `2px solid ${gold}` }}
              placeholder="Enter your password" 
            />
          </div>
          
          <button 
            onClick={() => onLogin(isAdmin ? 'admin' : 'parent', { 
              name: isAdmin ? 'Admin User' : 'Sarah Williams', 
              email, 
              children: isAdmin ? [] : [{ name: 'Emma', class: 'FS1 Blue' }, { name: 'Oliver', class: 'Y2 Red' }]
            })} 
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '18px',
              cursor: 'pointer',
              border: 'none',
              backgroundColor: burgundy,
              color: 'white'
            }}
          >
            Login
          </button>
        </div>
        
        <p className="text-xs text-center mt-4" style={{ color: burgundy, opacity: 0.6 }}>
          Demo: Use any email/password to login
        </p>
      </div>
    </div>
  );
};

const ParentView = ({ 
  messages, 
  surveys, 
  surveyResponses, 
  onSurveyResponse, 
  currentUser, 
  classColors, 
  selectedClassFilter, 
  onClassFilterChange, 
  burgundy, 
  messageAcknowledgments, 
  onMessageAcknowledgment,
  pulseSurveys,
  pulseResponses,
  onSubmitPulse,
  getScheduleForDate,
  weeklyMessage,
  weeklyMessageHearts,
  onWeeklyMessageHeart
}) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareContent, setShareContent] = useState(null);
  const [showPulseSurvey, setShowPulseSurvey] = useState(false);
  const [pulseAnswers, setPulseAnswers] = useState({});
  const [showWeeklyMessage, setShowWeeklyMessage] = useState(false);

  const parentClasses = currentUser?.children?.map(c => c.class) || [];
  const relevantMessages = messages.filter(m => m.class === 'Whole School' || parentClasses.includes(m.class));
  const displayedMessages = selectedClassFilter === 'all' ? relevantMessages : relevantMessages.filter(m => m.class === selectedClassFilter);
  const availableClasses = ['all', ...new Set(relevantMessages.map(m => m.class))];
  const relevantSurveys = surveys.filter(s => s.active && (s.targetClass === 'Whole School' || parentClasses.includes(s.targetClass)));
  const hasResponded = (surveyId) => surveyResponses.some(r => r.surveyId === surveyId && r.userId === currentUser.email);
  
  // Weekly message helpers - get current week's message
  const currentWeeklyMessage = Array.isArray(weeklyMessage) ? weeklyMessage.find(m => m.isCurrent) : weeklyMessage;
  const hasHeartedWeekly = currentWeeklyMessage ? weeklyMessageHearts?.some(h => h.messageId === currentWeeklyMessage.id && h.userId === currentUser.email) : false;
  const weeklyHeartCount = currentWeeklyMessage ? weeklyMessageHearts?.filter(h => h.messageId === currentWeeklyMessage.id).length || 0 : 0;
  
  // Pulse survey helpers
  const openPulse = pulseSurveys?.find(p => p.status === 'OPEN');
  const hasSubmittedPulse = openPulse ? pulseResponses?.some(r => r.pulse_survey_id === openPulse.id && r.parent_user_id === currentUser.email) : false;

  // Today at a Glance helpers - using combined recurring + one-off schedule
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const todaysItems = getScheduleForDate(today).filter(item => {
    return item.class === 'Whole School' || parentClasses.includes(item.class);
  }) || [];

  // Group today's items by child
  const itemsByChild = currentUser?.children?.map(child => {
    const childItems = todaysItems.filter(item => 
      item.class === child.class || item.class === 'Whole School'
    );
    return { child, items: childItems };
  }).filter(group => group.items.length > 0) || [];
  // Acknowledgment helpers
  const hasAcknowledged = (messageId) => messageAcknowledgments.some(ack => ack.messageId === messageId && ack.userId === currentUser.email);
  const getAcknowledgmentCount = (messageId) => messageAcknowledgments.filter(ack => ack.messageId === messageId).length;

  const handleShareClick = (message) => {
    const text = `📢 ${message.title}\n\n${message.content}\n\n📅 ${new Date(message.timestamp).toLocaleDateString()}\n👤 From: ${message.sender}\n🏫 Class: ${message.class}\n\n---\nVictory Heights Primary School\nCity of Arabia`;
    setShareContent({ text, encoded: encodeURIComponent(text), title: message.title });
    setShowShareModal(true);
  };

  return (
    <div className="space-y-6">
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: burgundy }}>Share Message</h3>
              <button onClick={() => setShowShareModal(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap">{shareContent?.text}</pre>
            </div>
            <div className="space-y-2">
              <button 
                onClick={() => { navigator.clipboard.writeText(shareContent.text); alert('✅ Copied!'); setShowShareModal(false); }}
                className="w-full py-3 rounded-lg text-white font-medium"
                style={{ backgroundColor: burgundy }}
              >
                📋 Copy to Clipboard
              </button>
              <button 
                onClick={() => { window.open(`https://wa.me/?text=${shareContent.encoded}`, '_blank'); setShowShareModal(false); }}
                className="w-full py-3 rounded-lg bg-green-500 text-white font-medium"
              >
                💬 Open WhatsApp Web
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parent Pulse Survey Card */}
      {openPulse && !hasSubmittedPulse && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-6 shadow-lg">
          <div className="flex items-start space-x-4 mb-4">
            <div className="bg-amber-500 text-white rounded-full p-3 text-2xl">📋</div>
            <div className="flex-1">
              <h3 className="font-bold text-xl mb-1" style={{ color: burgundy }}>1-Minute Parent Pulse</h3>
              <p className="text-gray-700 text-sm mb-2">Help us improve! Share your experience of {openPulse.half_term_name}.</p>
              <p className="text-xs text-gray-600">Closes: {new Date(openPulse.closes_at).toLocaleDateString()}</p>
            </div>
          </div>
          <button
            onClick={() => setShowPulseSurvey(true)}
            className="w-full py-3 rounded-lg text-white font-semibold text-lg"
            style={{ backgroundColor: burgundy }}
          >
            Start Survey →
          </button>
        </div>
      )}

      {/* Parent Pulse already submitted */}
      {openPulse && hasSubmittedPulse && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-5">
          <div className="flex items-start space-x-3">
            <div className="bg-green-500 text-white rounded-full p-2 text-xl">✓</div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1 text-green-800">Thank You!</h3>
              <p className="text-gray-700 text-sm">Your feedback for {openPulse.half_term_name} has been received. We appreciate you taking the time to help us improve.</p>
            </div>
          </div>
        </div>
      )}

      {/* Today at a Glance */}
      {todaysItems.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-5 shadow-lg">
          <div className="flex items-start space-x-3 mb-4">
            <div className="bg-blue-500 text-white rounded-full p-2 text-2xl">📅</div>
            <div className="flex-1">
              <h3 className="font-bold text-xl mb-1" style={{ color: burgundy }}>Today at a Glance</h3>
              <p className="text-sm text-gray-600">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          {itemsByChild.length > 0 ? (
            <div className="space-y-4">
              {itemsByChild.map((group, idx) => (
                <div key={idx} className="bg-white rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-lg mb-3" style={{ color: burgundy }}>
                    {group.child.name} ({group.child.class})
                  </h4>
                  <div className="space-y-2">
                    {group.items.map(item => (
                      <div key={item.id} className="flex items-start space-x-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.label}</p>
                          <p className="text-sm text-gray-600">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Whole School items that affect all children */}
              {todaysItems.filter(item => item.class === 'Whole School').length > 0 && (
                <div className="bg-white rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-lg mb-3" style={{ color: burgundy }}>
                    Whole School
                  </h4>
                  <div className="space-y-2">
                    {todaysItems.filter(item => item.class === 'Whole School').map(item => (
                      <div key={item.id} className="flex items-start space-x-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.label}</p>
                          <p className="text-sm text-gray-600">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Pulse Survey Modal */}
      {showPulseSurvey && openPulse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowPulseSurvey(false)}>
          <div className="bg-white rounded-lg max-w-2xl w-full flex flex-col" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-2xl font-bold" style={{ color: burgundy }}>Parent Pulse Survey</h3>
                <p className="text-sm text-gray-600">{openPulse.half_term_name} • Takes ~1 minute</p>
              </div>
              <button onClick={() => setShowPulseSurvey(false)}><X className="h-6 w-6" /></button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-6 flex-1">
              {/* Scale Legend */}
              <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-gray-700 text-center">
                  <span className="font-semibold">Rate each statement:</span> 1 (Strongly Disagree) → 5 (Strongly Agree)
                </p>
              </div>

              <div className="space-y-6">
                {openPulse.questions.filter(q => q.type === 'LIKERT_5').map((question, idx) => (
                  <div key={question.id} className="border-b pb-4">
                    <p className="font-medium mb-3 text-gray-800">
                      {idx + 1}. {question.text}
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map(value => {
                        const isSelected = pulseAnswers[question.id] === value;
                        // Color coding: 1=red, 2=orange, 3=amber, 4=light green, 5=green
                        let buttonColor = '';
                        let selectedColor = '';
                        let borderColor = '';
                        
                        if (value === 1) {
                          buttonColor = isSelected ? 'bg-red-500 text-white' : 'bg-white';
                          borderColor = isSelected ? 'border-red-500' : 'border-gray-300 hover:border-red-400';
                        } else if (value === 2) {
                          buttonColor = isSelected ? 'bg-orange-500 text-white' : 'bg-white';
                          borderColor = isSelected ? 'border-orange-500' : 'border-gray-300 hover:border-orange-400';
                        } else if (value === 3) {
                          buttonColor = isSelected ? 'bg-amber-500 text-white' : 'bg-white';
                          borderColor = isSelected ? 'border-amber-500' : 'border-gray-300 hover:border-amber-400';
                        } else if (value === 4) {
                          buttonColor = isSelected ? 'bg-lime-500 text-white' : 'bg-white';
                          borderColor = isSelected ? 'border-lime-500' : 'border-gray-300 hover:border-lime-400';
                        } else {
                          buttonColor = isSelected ? 'bg-green-500 text-white' : 'bg-white';
                          borderColor = isSelected ? 'border-green-500' : 'border-gray-300 hover:border-green-400';
                        }

                        return (
                          <button
                            key={value}
                            onClick={() => setPulseAnswers({ ...pulseAnswers, [question.id]: value })}
                            className={`py-2 px-1 rounded-lg border-2 transition-all ${buttonColor} ${borderColor} ${!isSelected && 'hover:shadow-md'}`}
                          >
                            <div className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-gray-700'}`}>{value}</div>
                            {(value === 1 || value === 5) && (
                              <div className={`text-xs leading-tight mt-1 ${isSelected ? 'text-white' : 'text-gray-600'}`}>
                                {value === 1 ? 'Strongly Disagree' : 'Strongly Agree'}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Optional text question */}
                {openPulse.questions.filter(q => q.type === 'TEXT_OPTIONAL').map(question => (
                  <div key={question.id}>
                    <p className="font-medium mb-2 text-gray-800">{question.text}</p>
                    <p className="text-sm text-gray-500 mb-2">Optional</p>
                    <textarea
                      value={pulseAnswers[question.id] || ''}
                      onChange={(e) => setPulseAnswers({ ...pulseAnswers, [question.id]: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 focus:outline-none"
                      rows="3"
                      placeholder="Your feedback (optional)..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Sticky Footer with Submit Button */}
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  // Validate all likert questions answered
                  const likertQuestions = openPulse.questions.filter(q => q.type === 'LIKERT_5');
                  const allAnswered = likertQuestions.every(q => pulseAnswers[q.id]);
                  
                  if (!allAnswered) {
                    alert('Please answer all questions (1-6)');
                    return;
                  }
                  
                  onSubmitPulse(openPulse.id, pulseAnswers);
                  setShowPulseSurvey(false);
                  setPulseAnswers({});
                  alert('✅ Thank you! Your feedback has been submitted.');
                }}
                className="w-full py-3 rounded-lg text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow"
                style={{ backgroundColor: burgundy }}
              >
                Submit Survey
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick Polls removed - keeping only the formal 1-Minute Parent Pulse */}

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6" style={{ color: burgundy }}>Messages</h2>
        
        {/* Weekly Headteacher Message */}
        {currentWeeklyMessage && (
          <div className="mb-6 border-2 rounded-lg overflow-hidden" style={{ borderColor: burgundy }}>
            {!showWeeklyMessage ? (
              /* Collapsed View */
              <div 
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setShowWeeklyMessage(true)}
              >
                <div className="flex items-center space-x-4">
                  {/* Circular Headteacher Photo */}
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                    style={{ backgroundColor: burgundy }}
                  >
                    BJ
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg" style={{ color: burgundy }}>
                      {currentWeeklyMessage.title}
                    </h3>
                    <p className="text-sm text-gray-600">Week of {currentWeeklyMessage.weekOf}</p>
                    <p className="text-sm text-gray-500 mt-1">Click to read this week's message →</p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!hasHeartedWeekly) {
                          onWeeklyMessageHeart(currentWeeklyMessage.id);
                        }
                      }}
                      disabled={hasHeartedWeekly}
                      className={`p-2 rounded-full transition-colors ${
                        hasHeartedWeekly 
                          ? 'bg-red-500 text-white' 
                          : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500'
                      }`}
                    >
                      <Heart className={`h-5 w-5 ${hasHeartedWeekly ? 'fill-current' : ''}`} />
                    </button>
                    {weeklyHeartCount > 0 && (
                      <div className="flex items-center space-x-1 text-gray-400">
                        <Heart className="h-4 w-4" />
                        <span className="text-sm font-medium">{weeklyHeartCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Expanded View */
              <div>
                <div className="px-4 py-2" style={{ backgroundColor: burgundy }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center bg-white text-xl font-bold"
                        style={{ color: burgundy }}
                      >
                        BJ
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{currentWeeklyMessage.title}</h3>
                        <p className="text-xs text-white opacity-90">Week of {currentWeeklyMessage.weekOf}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowWeeklyMessage(false)}
                      className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="prose max-w-none">
                    {currentWeeklyMessage.content.split('\n').map((paragraph, idx) => (
                      <p key={idx} className="text-gray-700 mb-3 whitespace-pre-wrap">{paragraph}</p>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <button
                      onClick={() => {
                        if (!hasHeartedWeekly) {
                          onWeeklyMessageHeart(currentWeeklyMessage.id);
                        }
                      }}
                      disabled={hasHeartedWeekly}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                        hasHeartedWeekly 
                          ? 'bg-red-500 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600'
                      }`}
                    >
                      <Heart className={`h-5 w-5 ${hasHeartedWeekly ? 'fill-current' : ''}`} />
                      <span className="font-medium">{hasHeartedWeekly ? 'Appreciated' : 'Show Appreciation'}</span>
                    </button>
                    
                    {weeklyHeartCount > 0 && (
                      <div className="flex items-center space-x-2 text-gray-500">
                        <Heart className="h-5 w-5 fill-current text-red-300" />
                        <span className="font-medium">{weeklyHeartCount} {weeklyHeartCount === 1 ? 'parent' : 'parents'} appreciated this</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="flex flex-wrap gap-2 mb-6">
          {availableClasses.map(cls => (
            <button 
              key={cls} 
              onClick={() => onClassFilterChange(cls)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${selectedClassFilter === cls ? (cls === 'all' ? 'bg-blue-600 text-white' : `${classColors[cls]?.bg} ${classColors[cls]?.text}`) : 'bg-gray-100 text-gray-700'}`}
            >
              {cls === 'all' ? 'All Messages' : cls}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {displayedMessages.map(msg => {
            const acknowledged = hasAcknowledged(msg.id);
            const ackCount = getAcknowledgmentCount(msg.id);
            
            return (
              <div key={msg.id} className="border rounded-lg overflow-hidden">
                {/* Colored bar at top with class name */}
                <div className={`${msg.class === 'Whole School' ? 'bg-gray-700 text-white' : `${classColors[msg.class]?.bg} ${classColors[msg.class]?.text}`} px-4 py-1.5 flex items-center justify-between`}>
                  <span className="text-xs font-medium">{msg.class}</span>
                  <button onClick={() => handleShareClick(msg)} className="p-1 hover:bg-white hover:bg-opacity-20 rounded-full">
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Message content */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg flex-1">{msg.title}</h3>
                    {msg.actionRequired && (
                      <div className="ml-3">
                        <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                          msg.actionRequired.type === 'payment' ? 'bg-red-100 text-red-700 border-2 border-red-300' :
                          msg.actionRequired.type === 'consent' ? 'bg-orange-100 text-orange-700 border-2 border-orange-300' :
                          msg.actionRequired.type === 'rsvp' ? 'bg-blue-100 text-blue-700 border-2 border-blue-300' :
                          'bg-purple-100 text-purple-700 border-2 border-purple-300'
                        }`}>
                          ⚠️ {msg.actionRequired.label}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {msg.actionRequired && (
                    <div className="mb-3 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                      <p className="text-sm font-semibold text-yellow-900">
                        Due: {new Date(msg.actionRequired.dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {msg.actionRequired.amount && ` • ${msg.actionRequired.amount}`}
                      </p>
                    </div>
                  )}
                  
                  <p className="text-gray-600 mb-3">{msg.content}</p>
                  
                  {/* Acknowledgment row */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => !acknowledged && onMessageAcknowledgment(msg.id)}
                        disabled={acknowledged}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg transition-colors ${
                          acknowledged 
                            ? 'bg-green-500 text-white cursor-not-allowed' 
                            : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600'
                        }`}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        <span className="text-xs font-medium">{acknowledged ? 'Acknowledged' : 'Acknowledge'}</span>
                      </button>
                    </div>
                    
                    <div className="flex items-center space-x-1 text-gray-400">
                      <ThumbsUp className="h-4 w-4" />
                      <span className="text-sm font-medium">{ackCount}</span>
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-2">{msg.sender} • {new Date(msg.timestamp).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const EventsView = ({ events, currentUser, classColors, eventRSVPs, onEventRSVP, burgundy, gold }) => {
  const parentClasses = currentUser?.children?.map(c => c.class) || [];
  const relevantEvents = events.filter(e => e.targetClass === 'Whole School' || parentClasses.includes(e.targetClass));
  const getUserRSVP = (eventId) => eventRSVPs.find(r => r.eventId === eventId && r.userId === currentUser?.email);

  // Function to generate ICS calendar file
  const addToCalendar = (event) => {
    const formatICSDate = (dateStr, timeStr) => {
      const [year, month, day] = dateStr.split('-');
      const [time] = timeStr.split(' ');
      const [hours, minutes] = time.split(':');
      return `${year}${month}${day}T${hours}${minutes}00`;
    };

    const startDateTime = formatICSDate(event.date, event.time);
    const endDate = new Date(`${event.date}T${event.time.split(' ')[0]}`);
    endDate.setHours(endDate.getHours() + 2); // Assume 2-hour duration
    const endDateTime = endDate.toISOString().replace(/[-:]/g, '').split('.')[0];

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Wasil//School Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${event.id}@wasil.app
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART:${startDateTime}
DTEND:${endDateTime}
SUMMARY:${event.title}
DESCRIPTION:${event.description.replace(/\n/g, '\\n')}
LOCATION:${event.location}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Categorize events by time
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay())); // End of current week (Sunday)
  
  const categorizedEvents = {
    today: [],
    thisWeek: [],
    upcoming: []
  };

  relevantEvents.forEach(event => {
    const eventDate = new Date(event.date);
    eventDate.setHours(0, 0, 0, 0);
    
    if (eventDate.getTime() === today.getTime()) {
      categorizedEvents.today.push(event);
    } else if (eventDate > today && eventDate <= endOfWeek) {
      categorizedEvents.thisWeek.push(event);
    } else if (eventDate > endOfWeek) {
      categorizedEvents.upcoming.push(event);
    }
  });

  const renderEvent = (event) => {
    const userRSVP = getUserRSVP(event.id);
    return (
      <div key={event.id} className="border rounded-lg overflow-hidden">
        {/* Colored bar at top with class name */}
        <div className={`${event.targetClass === 'Whole School' ? 'bg-gray-700 text-white' : `${classColors[event.targetClass]?.bg} ${classColors[event.targetClass]?.text}`} px-4 py-1.5 flex items-center justify-between`}>
          <span className="text-xs font-medium">{event.targetClass}</span>
        </div>
        {/* Event content */}
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
          <p className="text-gray-600 text-sm mb-3">{event.description}</p>
          <div className="flex items-start justify-between">
            <div className="text-sm text-gray-600 space-y-1 flex-1">
              <p>📅 {event.date} • 🕐 {event.time}</p>
              <p>📍 {event.location}</p>
            </div>
            <button
              onClick={() => addToCalendar(event)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-sm"
              title="Add to calendar"
            >
              <Calendar className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>
          {event.requiresRSVP && (
            <div className="mt-4 flex space-x-2">
              <button 
                onClick={() => onEventRSVP(event.id, 'going')} 
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${userRSVP?.status === 'going' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'}`}
              >
                ✓ Going
              </button>
              <button 
                onClick={() => onEventRSVP(event.id, 'maybe')} 
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${userRSVP?.status === 'maybe' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-yellow-50'}`}
              >
                ? Maybe
              </button>
              <button 
                onClick={() => onEventRSVP(event.id, 'not-going')} 
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${userRSVP?.status === 'not-going' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50'}`}
              >
                ✗ Can't Attend
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6" style={{ color: burgundy }}>Events Calendar</h2>
      
      {/* Today */}
      {categorizedEvents.today.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3" style={{ color: burgundy }}>Today</h3>
          <div className="space-y-3">
            {categorizedEvents.today.map(event => renderEvent(event))}
          </div>
        </div>
      )}

      {/* This Week */}
      {categorizedEvents.thisWeek.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3" style={{ color: burgundy }}>This Week</h3>
          <div className="space-y-3">
            {categorizedEvents.thisWeek.map(event => renderEvent(event))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {categorizedEvents.upcoming.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3" style={{ color: burgundy }}>Upcoming</h3>
          <div className="space-y-3">
            {categorizedEvents.upcoming.map(event => renderEvent(event))}
          </div>
        </div>
      )}

      {/* No events message */}
      {relevantEvents.length === 0 && (
        <p className="text-gray-500 text-center py-8">No upcoming events</p>
      )}
    </div>
  );
};

const AdminView = ({ messages, surveys, surveyResponses, events, eventRSVPs, classes, parents, onSendMessage, onCreateSurvey, onCreateEvent, onBulkImportEvents, onAddClass, onDeleteClass, onAddParent, onUpdateParent, onDeleteParent, classColors, burgundy, gold, pulseSurveys, pulseResponses, halfTerms, onSendPulseNow, onClosePulseNow, dailySchedule, recurringSchedule, onAddScheduleItem, onUpdateScheduleItem, onDeleteScheduleItem, onAddRecurringItem, onToggleRecurringItem, onDeleteRecurringItem }) => {
  const [activeTab, setActiveTab] = useState('compose');
  const [selectedPulse, setSelectedPulse] = useState(null);
  
  // Message composer state
  const [newMessage, setNewMessage] = useState({ 
    title: '', 
    content: '', 
    class: 'Whole School',
    hasAction: false,
    actionType: 'payment',
    actionLabel: '',
    actionDueDate: '',
    actionAmount: ''
  });
  
  // Survey creator state
  const [newSurvey, setNewSurvey] = useState({ question: '', options: ['', '', '', ''], targetClass: 'Whole School' });
  
  // Event creator state
  const [newEvent, setNewEvent] = useState({
    title: '', description: '', date: '', time: '', location: '', targetClass: 'Whole School', requiresRSVP: false
  });

  // Class management state
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3b82f6'); // Default blue

  // Parent management state
  const [newParent, setNewParent] = useState({
    name: '', email: '', password: '', children: [{ name: '', class: classes[0] || '' }]
  });
  const [editingParent, setEditingParent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Daily schedule management state
  const [newScheduleItem, setNewScheduleItem] = useState({
    class: 'Whole School',
    date: new Date().toISOString().split('T')[0],
    type: 'pe',
    label: '',
    description: '',
    icon: '🏃'
  });

  // Recurring schedule management state
  const [newRecurringItem, setNewRecurringItem] = useState({
    class: classes[0] || '',
    dayOfWeek: 1, // Monday
    type: 'pe',
    label: 'PE Day',
    description: 'Please wear PE kit',
    icon: '🏃'
  });

  // Day of week names
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Auto-detect color from class name
  const detectColorFromName = (name) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('blue')) return '#3b82f6';
    if (lowerName.includes('red')) return '#ef4444';
    if (lowerName.includes('green')) return '#10b981';
    if (lowerName.includes('yellow') || lowerName.includes('gold')) return '#f59e0b';
    if (lowerName.includes('purple') || lowerName.includes('violet')) return '#a855f7';
    if (lowerName.includes('orange')) return '#f97316';
    if (lowerName.includes('pink')) return '#ec4899';
    if (lowerName.includes('brown')) return '#92400e';
    if (lowerName.includes('grey') || lowerName.includes('gray')) return '#6b7280';
    if (lowerName.includes('black')) return '#1f2937';
    return '#3b82f6'; // Default blue
  };

  // Update color when class name changes
  const handleClassNameChange = (value) => {
    setNewClassName(value);
    setNewClassColor(detectColorFromName(value));
  };

  const handleSendMessage = () => {
    if (newMessage.title && newMessage.content) {
      onSendMessage(newMessage);
      setNewMessage({ title: '', content: '', class: 'Whole School' });
      alert('✅ Message sent successfully!');
    }
  };

  const handleCreateSurvey = () => {
    const filledOptions = newSurvey.options.filter(opt => opt.trim() !== '');
    if (newSurvey.question && filledOptions.length >= 2) {
      onCreateSurvey({ ...newSurvey, options: filledOptions });
      setNewSurvey({ question: '', options: ['', '', '', ''], targetClass: 'Whole School' });
      alert('✅ Pulse survey created successfully!');
    } else {
      alert('Please enter a question and at least 2 options');
    }
  };

  const handleCreateEvent = () => {
    if (newEvent.title && newEvent.date && newEvent.time && newEvent.location) {
      onCreateEvent(newEvent);
      setNewEvent({ title: '', description: '', date: '', time: '', location: '', targetClass: 'Whole School', requiresRSVP: false });
      alert('✅ Event created successfully!');
    } else {
      alert('Please fill in all required fields');
    }
  };

  const getSurveyStats = (surveyId) => {
    const responses = surveyResponses.filter(r => r.surveyId === surveyId);
    const survey = surveys.find(s => s.id === surveyId);
    if (!survey) return null;
    
    const stats = {};
    survey.options.forEach(opt => {
      stats[opt] = responses.filter(r => r.response === opt).length;
    });
    
    return { total: responses.length, breakdown: stats };
  };

  const getEventRSVPStats = (eventId) => {
    const rsvps = eventRSVPs.filter(r => r.eventId === eventId);
    return {
      going: rsvps.filter(r => r.status === 'going').length,
      maybe: rsvps.filter(r => r.status === 'maybe').length,
      notGoing: rsvps.filter(r => r.status === 'not-going').length
    };
  };

  const handleAddClass = () => {
    if (newClassName.trim()) {
      onAddClass(newClassName.trim());
      setNewClassName('');
      alert('✅ Class added successfully!');
    }
  };

  const handleAddParent = () => {
    const filledChildren = newParent.children.filter(c => c.name.trim());
    if (newParent.name && newParent.email && filledChildren.length > 0) {
      onAddParent({ ...newParent, children: filledChildren });
      setNewParent({ name: '', email: '', password: '', children: [{ name: '', class: classes[0] || '' }] });
      alert('✅ Parent registered successfully!');
    } else {
      alert('Please fill in parent name, email, and at least one child');
    }
  };

  const handleUpdateParent = () => {
    if (editingParent) {
      onUpdateParent(editingParent.id, editingParent);
      setEditingParent(null);
      alert('✅ Parent updated successfully!');
    }
  };

  const addChildToNewParent = () => {
    setNewParent({
      ...newParent,
      children: [...newParent.children, { name: '', class: classes[0] || '' }]
    });
  };

  const updateNewParentChild = (index, field, value) => {
    const updated = [...newParent.children];
    updated[index][field] = value;
    setNewParent({ ...newParent, children: updated });
  };

  const removeChildFromNewParent = (index) => {
    setNewParent({
      ...newParent,
      children: newParent.children.filter((_, i) => i !== index)
    });
  };

  const filteredParents = parents.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Dashboard Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderLeftColor: burgundy }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Messages</p>
              <p className="text-3xl font-bold" style={{ color: burgundy }}>{messages.length}</p>
            </div>
            <Send className="h-12 w-12 text-gray-300" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderLeftColor: '#10b981' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Quick Polls</p>
              <p className="text-3xl font-bold text-green-600">{surveys.filter(s => s.active).length}</p>
            </div>
            <span className="text-5xl">📊</span>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderLeftColor: '#3b82f6' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Upcoming Events</p>
              <p className="text-3xl font-bold text-blue-600">{events.length}</p>
            </div>
            <Bell className="h-12 w-12 text-gray-300" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex space-x-4 border-b border-gray-200 mb-6">
          <button 
            onClick={() => setActiveTab('compose')}
            className={`pb-3 px-4 font-medium ${activeTab === 'compose' ? 'border-b-2 text-white' : 'text-gray-600'}`}
            style={activeTab === 'compose' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Compose Message
          </button>
          <button 
            onClick={() => setActiveTab('survey')}
            className={`pb-3 px-4 font-medium ${activeTab === 'survey' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'survey' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Create Quick Poll
          </button>
          <button 
            onClick={() => setActiveTab('event')}
            className={`pb-3 px-4 font-medium ${activeTab === 'event' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'event' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Create Event
          </button>
          <button 
            onClick={() => setActiveTab('results')}
            className={`pb-3 px-4 font-medium ${activeTab === 'results' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'results' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Quick Poll Results
          </button>
          <button 
            onClick={() => setActiveTab('rsvps')}
            className={`pb-3 px-4 font-medium ${activeTab === 'rsvps' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'rsvps' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Event RSVPs
          </button>
          <button 
            onClick={() => setActiveTab('classes')}
            className={`pb-3 px-4 font-medium ${activeTab === 'classes' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'classes' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Manage Classes
          </button>
          <button 
            onClick={() => setActiveTab('parents')}
            className={`pb-3 px-4 font-medium ${activeTab === 'parents' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'parents' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Manage Parents
          </button>
          <button 
            onClick={() => setActiveTab('pulse')}
            className={`pb-3 px-4 font-medium ${activeTab === 'pulse' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'pulse' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Parent Pulse
          </button>
          <button 
            onClick={() => setActiveTab('schedule')}
            className={`pb-3 px-4 font-medium ${activeTab === 'schedule' ? 'border-b-2' : 'text-gray-600'}`}
            style={activeTab === 'schedule' ? { borderBottomColor: burgundy, color: burgundy } : {}}
          >
            Daily Schedule
          </button>
        </div>

        {/* Compose Message */}
        {activeTab === 'compose' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Message Title</label>
              <input 
                type="text" 
                value={newMessage.title}
                onChange={(e) => setNewMessage({ ...newMessage, title: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg"
                style={{ borderColor: gold }}
                placeholder="e.g., School Closure Notification"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Target Audience</label>
              <select 
                value={newMessage.class}
                onChange={(e) => setNewMessage({ ...newMessage, class: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg"
                style={{ borderColor: gold }}
              >
                <option value="Whole School">Whole School</option>
                {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Message Content</label>
              <textarea 
                value={newMessage.content}
                onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg h-32"
                style={{ borderColor: gold }}
                placeholder="Write your message here..."
              />
            </div>

            {/* Action Required Section */}
            <div className="border-2 border-orange-300 rounded-lg p-4 bg-orange-50">
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="checkbox"
                  id="hasAction"
                  checked={newMessage.hasAction}
                  onChange={(e) => setNewMessage({ ...newMessage, hasAction: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="hasAction" className="font-semibold" style={{ color: burgundy }}>
                  This message requires parent action
                </label>
              </div>

              {newMessage.hasAction && (
                <div className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-700">Action Type</label>
                      <select
                        value={newMessage.actionType}
                        onChange={(e) => setNewMessage({ ...newMessage, actionType: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="payment">Payment Required</option>
                        <option value="consent">Consent Form</option>
                        <option value="rsvp">RSVP</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-700">Due Date</label>
                      <input
                        type="date"
                        value={newMessage.actionDueDate}
                        onChange={(e) => setNewMessage({ ...newMessage, actionDueDate: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  {newMessage.actionType === 'payment' && (
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-700">Amount (optional)</label>
                      <input
                        type="text"
                        value={newMessage.actionAmount}
                        onChange={(e) => setNewMessage({ ...newMessage, actionAmount: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        placeholder="e.g., AED 150"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700">Custom Label (optional)</label>
                    <input
                      type="text"
                      value={newMessage.actionLabel}
                      onChange={(e) => setNewMessage({ ...newMessage, actionLabel: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="Leave blank for default label"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => {
                onSendMessage(newMessage);
                setNewMessage({ 
                  title: '', 
                  content: '', 
                  class: 'Whole School',
                  hasAction: false,
                  actionType: 'payment',
                  actionLabel: '',
                  actionDueDate: '',
                  actionAmount: ''
                });
              }}
              className="w-full py-3 rounded-lg text-white font-semibold flex items-center justify-center space-x-2"
              style={{ backgroundColor: burgundy }}
            >
              <Send className="h-5 w-5" />
              <span>Send Message</span>
            </button>
          </div>
        )}

        {/* Create Quick Poll */}
        {activeTab === 'survey' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Quick Poll Tips</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Keep questions simple and focused</li>
                <li>• 2-4 options work best for quick responses</li>
                <li>• Results are anonymous and aggregate</li>
                <li>• Note: Separate from the formal "Parent Pulse" survey</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Poll Question</label>
              <input 
                type="text" 
                value={newSurvey.question}
                onChange={(e) => setNewSurvey({ ...newSurvey, question: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg"
                style={{ borderColor: gold }}
                placeholder="e.g., How do you rate our communication this term?"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Response Options</label>
              {newSurvey.options.map((option, idx) => (
                <input 
                  key={idx}
                  type="text" 
                  value={option}
                  onChange={(e) => {
                    const updated = [...newSurvey.options];
                    updated[idx] = e.target.value;
                    setNewSurvey({ ...newSurvey, options: updated });
                  }}
                  className="w-full px-4 py-2 border-2 rounded-lg mb-2"
                  style={{ borderColor: gold }}
                  placeholder={`Option ${idx + 1}`}
                />
              ))}
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Target Audience</label>
              <select 
                value={newSurvey.targetClass}
                onChange={(e) => setNewSurvey({ ...newSurvey, targetClass: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg"
                style={{ borderColor: gold }}
              >
                <option value="Whole School">Whole School</option>
                {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
            
            <button 
              onClick={handleCreateSurvey}
              className="w-full py-3 rounded-lg bg-green-600 text-white font-semibold"
            >
              📊 Create Quick Poll
            </button>
          </div>
        )}

        {/* Create Event */}
        {activeTab === 'event' && (
          <div className="space-y-6">
            {/* CSV Bulk Import Section */}
            <div className="border-2 border-green-300 rounded-lg p-6 bg-green-50">
              <h3 className="text-lg font-bold mb-2" style={{ color: burgundy }}>📤 Bulk Import Events (CSV)</h3>
              <p className="text-sm text-gray-600 mb-4">Upload a CSV file to add multiple events at once</p>
              
              <div className="bg-white border-2 border-green-400 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-sm mb-2" style={{ color: burgundy }}>CSV Format Required:</h4>
                <div className="bg-gray-100 p-3 rounded text-xs font-mono overflow-x-auto mb-3">
                  <div>Title,Description,Date,Time,Location,Target Class,Requires RSVP</div>
                  <div className="text-gray-600">Sports Day,Annual sports competition,2026-01-24,09:00-15:00,School Field,Whole School,Yes</div>
                  <div className="text-gray-600">Y2 Trip,Museum visit,2026-02-05,10:00-14:00,Dubai Museum,Y2 Red,No</div>
                </div>
                <ul className="text-xs text-gray-700 space-y-1">
                  <li>• <strong>Date format:</strong> YYYY-MM-DD (e.g., 2026-01-24)</li>
                  <li>• <strong>Target Class:</strong> Use exact class names or "Whole School"</li>
                  <li>• <strong>Requires RSVP:</strong> Yes/No or True/False</li>
                  <li>• <strong>Commas in text:</strong> Wrap field in quotes if it contains commas</li>
                </ul>
              </div>

              <input
                type="file"
                accept=".csv"
                id="csv-upload"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const csvData = event.target.result;
                      const count = onBulkImportEvents(csvData);
                      if (count > 0) {
                        alert(`✅ Successfully imported ${count} event${count !== 1 ? 's' : ''}!`);
                        e.target.value = ''; // Reset input
                      } else {
                        alert('❌ No valid events found in CSV. Please check the format.');
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
              <label
                htmlFor="csv-upload"
                className="w-full py-3 rounded-lg text-white font-semibold flex items-center justify-center space-x-2 cursor-pointer"
                style={{ backgroundColor: burgundy }}
              >
                <span>📂 Choose CSV File</span>
              </label>
            </div>

            {/* OR Divider */}
            <div className="flex items-center space-x-4">
              <div className="flex-1 border-t border-gray-300"></div>
              <span className="text-gray-500 font-medium">OR</span>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>

            {/* Manual Single Event Creation */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold" style={{ color: burgundy }}>Create Single Event</h3>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Event Title</label>
              <input 
                type="text" 
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg"
                style={{ borderColor: gold }}
                placeholder="e.g., Sports Day"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Description</label>
              <textarea 
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg h-20"
                style={{ borderColor: gold }}
                placeholder="Event details..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Date</label>
                <input 
                  type="date" 
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="w-full px-4 py-2 border-2 rounded-lg"
                  style={{ borderColor: gold }}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Time</label>
                <input 
                  type="text" 
                  value={newEvent.time}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  className="w-full px-4 py-2 border-2 rounded-lg"
                  style={{ borderColor: gold }}
                  placeholder="e.g., 14:00 - 16:00"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Location</label>
              <input 
                type="text" 
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg"
                style={{ borderColor: gold }}
                placeholder="e.g., School Field"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Target Audience</label>
              <select 
                value={newEvent.targetClass}
                onChange={(e) => setNewEvent({ ...newEvent, targetClass: e.target.value })}
                className="w-full px-4 py-2 border-2 rounded-lg"
                style={{ borderColor: gold }}
              >
                <option value="Whole School">Whole School</option>
                {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
            
            <label className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                checked={newEvent.requiresRSVP}
                onChange={(e) => setNewEvent({ ...newEvent, requiresRSVP: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm font-medium" style={{ color: burgundy }}>Requires RSVP</span>
            </label>
            
            <button 
              onClick={handleCreateEvent}
              className="w-full py-3 rounded-lg text-white font-semibold"
              style={{ backgroundColor: burgundy }}
            >
              📅 Create Event
            </button>
            </div>
          </div>
        )}

        {/* Survey Results */}
        {activeTab === 'results' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4" style={{ color: burgundy }}>Survey Results</h3>
            {surveys.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No surveys created yet</p>
            ) : (
              surveys.map(survey => {
                const stats = getSurveyStats(survey.id);
                return (
                  <div key={survey.id} className="border rounded-lg p-4">
                    <div className="flex justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-semibold">{survey.question}</h4>
                        <p className="text-xs text-gray-500 mt-1">Target: {survey.targetClass}</p>
                      </div>
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                        {stats.total} responses
                      </span>
                    </div>
                    {survey.options.map(opt => {
                      const count = stats.breakdown[opt] || 0;
                      const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                      return (
                        <div key={opt} className="mb-2">
                          <div className="flex justify-between text-sm mb-1">
                            <span>{opt}</span>
                            <span className="font-medium">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: burgundy }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Event RSVPs */}
        {activeTab === 'rsvps' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4" style={{ color: burgundy }}>Event RSVPs</h3>
            {events.filter(e => e.requiresRSVP).length === 0 ? (
              <p className="text-gray-500 text-center py-8">No events with RSVPs yet</p>
            ) : (
              events.filter(e => e.requiresRSVP).map(event => {
                const stats = getEventRSVPStats(event.id);
                return (
                  <div key={event.id} className="border rounded-lg p-4">
                    <div className="flex justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{event.title}</h4>
                        <p className="text-sm text-gray-600">{event.date} • {event.targetClass}</p>
                      </div>
                      <span className="text-sm text-gray-500">{stats.going + stats.maybe + stats.notGoing} total</span>
                    </div>
                    <div className="flex space-x-4 text-sm">
                      <span className="text-green-600 font-medium">✓ {stats.going} Going</span>
                      <span className="text-yellow-600 font-medium">? {stats.maybe} Maybe</span>
                      <span className="text-red-600 font-medium">✗ {stats.notGoing} Can't Attend</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Manage Classes */}
        {activeTab === 'classes' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: burgundy }}>Add New Class</h3>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="flex-1 px-4 py-2 border-2 rounded-lg"
                  style={{ borderColor: gold }}
                  placeholder="e.g., Y5 Purple"
                />
                <button 
                  onClick={handleAddClass}
                  className="px-6 py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: burgundy }}
                >
                  Add Class
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: burgundy }}>Existing Classes ({classes.length})</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {classes.map(cls => (
                  <div key={cls} className="border rounded-lg p-4 flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${classColors[cls]?.bg || 'bg-gray-500'} ${classColors[cls]?.text || 'text-white'}`}>
                      {cls}
                    </span>
                    <button 
                      onClick={() => {
                        if (window.confirm(`Delete ${cls}? This will affect ${parents.filter(p => p.children.some(c => c.class === cls)).length} parents.`)) {
                          onDeleteClass(cls);
                        }
                      }}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Manage Parents */}
        {activeTab === 'parents' && (
          <div className="space-y-6">
            {/* Add New Parent */}
            <div className="border rounded-lg p-4" style={{ borderColor: gold }}>
              <h3 className="text-lg font-semibold mb-4" style={{ color: burgundy }}>Register New Parent</h3>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: burgundy }}>Parent Name</label>
                    <input 
                      type="text" 
                      value={newParent.name}
                      onChange={(e) => setNewParent({ ...newParent, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: burgundy }}>Email</label>
                    <input 
                      type="email" 
                      value={newParent.email}
                      onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: burgundy }}>Password (temporary)</label>
                  <input 
                    type="password" 
                    value={newParent.password}
                    onChange={(e) => setNewParent({ ...newParent, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Temporary password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: burgundy }}>Children</label>
                  {newParent.children.map((child, idx) => (
                    <div key={idx} className="flex space-x-2 mb-2">
                      <input 
                        type="text" 
                        value={child.name}
                        onChange={(e) => updateNewParentChild(idx, 'name', e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg"
                        placeholder="Child's name"
                      />
                      <select 
                        value={child.class}
                        onChange={(e) => updateNewParentChild(idx, 'class', e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                      >
                        {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                      </select>
                      {newParent.children.length > 1 && (
                        <button 
                          onClick={() => removeChildFromNewParent(idx)}
                          className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button 
                    onClick={addChildToNewParent}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Another Child
                  </button>
                </div>

                <button 
                  onClick={handleAddParent}
                  className="w-full py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: burgundy }}
                >
                  Register Parent
                </button>
              </div>
            </div>

            {/* Parent List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold" style={{ color: burgundy }}>Registered Parents ({parents.length})</h3>
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-2 border rounded-lg w-64"
                  placeholder="Search parents..."
                />
              </div>

              <div className="space-y-3">
                {filteredParents.map(parent => (
                  <div key={parent.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg">{parent.name}</h4>
                        <p className="text-sm text-gray-600">{parent.email}</p>
                        <div className="mt-2 space-y-1">
                          {parent.children.map((child, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium">{child.name}</span>
                              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${classColors[child.class]?.bg || 'bg-gray-500'} ${classColors[child.class]?.text || 'text-white'}`}>
                                {child.class}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => setEditingParent(parent)}
                          className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm(`Delete parent ${parent.name}?`)) {
                              onDeleteParent(parent.id);
                            }
                          }}
                          className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Parent Pulse Tab */}
        {activeTab === 'pulse' && (
          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-semibold text-amber-900 mb-2">📋 Parent Pulse Dashboard</h4>
              <p className="text-sm text-amber-800">View response rates, analyze feedback trends, and manage pulse surveys for each half term.</p>
            </div>

            {/* Pulse List */}
            <div>
              <h3 className="text-lg font-semibold mb-4" style={{ color: burgundy }}>Pulse Surveys</h3>
              <div className="space-y-3">
                {pulseSurveys?.sort((a, b) => b.id - a.id).map(pulse => {
                  const responses = pulseResponses?.filter(r => r.pulse_survey_id === pulse.id) || [];
                  const responseRate = parents.length > 0 ? ((responses.length / parents.length) * 100).toFixed(0) : 0;
                  
                  return (
                    <div key={pulse.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-lg">{pulse.half_term_name}</h4>
                          <p className="text-sm text-gray-600">
                            {new Date(pulse.opens_at).toLocaleDateString()} - {new Date(pulse.closes_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            pulse.status === 'OPEN' ? 'bg-green-100 text-green-700' :
                            pulse.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {pulse.status}
                          </span>
                          <div className="text-right">
                            <div className="text-2xl font-bold" style={{ color: burgundy }}>{responseRate}%</div>
                            <div className="text-xs text-gray-500">{responses.length}/{parents.length} responses</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2 mt-3">
                        <button
                          onClick={() => setSelectedPulse(pulse.id === selectedPulse ? null : pulse.id)}
                          className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
                        >
                          {selectedPulse === pulse.id ? 'Hide Details' : 'View Analytics'}
                        </button>
                        {pulse.status === 'SCHEDULED' && (
                          <button
                            onClick={() => onSendPulseNow(pulse.id)}
                            className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                          >
                            Send Now
                          </button>
                        )}
                        {pulse.status === 'OPEN' && (
                          <button
                            onClick={() => onClosePulseNow(pulse.id)}
                            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
                          >
                            Close Now
                          </button>
                        )}
                      </div>

                      {/* Analytics Detail View */}
                      {selectedPulse === pulse.id && responses.length > 0 && (
                        <div className="mt-6 pt-6 border-t">
                          <h5 className="font-semibold mb-4">Question Analytics</h5>
                          
                          {pulse.questions.filter(q => q.type === 'LIKERT_5').map(question => {
                            const answers = responses.map(r => r.answers[question.id]).filter(a => a);
                            const mean = answers.reduce((sum, val) => sum + val, 0) / answers.length;
                            const top2Box = answers.filter(a => a >= 4).length / answers.length * 100;
                            
                            // Distribution
                            const distribution = [1, 2, 3, 4, 5].map(val => ({
                              value: val,
                              count: answers.filter(a => a === val).length
                            }));

                            // Get previous pulse data for trend
                            const prevPulse = pulseSurveys.find(p => p.id === pulse.id - 1);
                            const prevResponses = prevPulse ? pulseResponses?.filter(r => r.pulse_survey_id === prevPulse.id) : [];
                            const prevAnswers = prevResponses.map(r => r.answers[question.id]).filter(a => a);
                            const prevMean = prevAnswers.length > 0 ? prevAnswers.reduce((sum, val) => sum + val, 0) / prevAnswers.length : null;
                            const delta = prevMean !== null ? mean - prevMean : null;
                            const isAlert = mean < 4.0 || (delta !== null && delta <= -0.3);

                            return (
                              <div key={question.id} className={`mb-6 p-4 rounded-lg ${isAlert ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                                <div className="flex items-start justify-between mb-3">
                                  <p className="font-medium text-sm flex-1">{question.text}</p>
                                  <div className="text-right ml-4">
                                    <div className="text-2xl font-bold" style={{ color: isAlert ? '#dc2626' : burgundy }}>
                                      {mean.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-gray-600">Mean Score</div>
                                    {delta !== null && (
                                      <div className={`text-xs font-medium ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                        {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta).toFixed(2)} vs prev
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                  <div>
                                    <div className="text-sm text-gray-600">Top-2 Box (Agree/Strongly Agree)</div>
                                    <div className="text-xl font-semibold text-green-700">{top2Box.toFixed(0)}%</div>
                                  </div>
                                  <div>
                                    <div className="text-sm text-gray-600">Response Count</div>
                                    <div className="text-xl font-semibold">{answers.length}</div>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <div className="text-xs text-gray-600 mb-1">Distribution:</div>
                                  {distribution.map(d => (
                                    <div key={d.value} className="flex items-center space-x-2">
                                      <span className="text-xs w-4">{d.value}</span>
                                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                                        <div
                                          className="bg-amber-500 h-2 rounded-full"
                                          style={{ width: `${(d.count / answers.length) * 100}%` }}
                                        />
                                      </div>
                                      <span className="text-xs w-8 text-right">{d.count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}

                          {/* Comments Section */}
                          <div className="mt-6">
                            <h5 className="font-semibold mb-3">Parent Comments</h5>
                            {responses.filter(r => r.answers.q7 && r.answers.q7.trim()).length > 0 ? (
                              <div className="space-y-2">
                                {responses.filter(r => r.answers.q7 && r.answers.q7.trim()).map((r, idx) => (
                                  <div key={idx} className="bg-white border rounded-lg p-3">
                                    <p className="text-sm text-gray-700 italic">"{r.answers.q7}"</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      {new Date(r.submitted_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No comments submitted.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Daily Schedule Tab */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">📅 Daily Schedule Management</h4>
              <p className="text-sm text-blue-800">Set recurring weekly activities (PE/Swimming) and add one-off events (trips, early finishes).</p>
            </div>

            {/* SECTION 1: Weekly Recurring Schedule */}
            <div className="border-2 border-green-200 rounded-lg p-6 bg-green-50">
              <h3 className="text-xl font-bold mb-2" style={{ color: burgundy }}>Weekly Recurring Schedule</h3>
              <p className="text-sm text-gray-600 mb-4">Set once - applies every week automatically (excludes half-terms & holidays)</p>
              
              {/* Add Recurring Item */}
              <div className="bg-white rounded-lg p-4 mb-4 border-2 border-green-300">
                <h4 className="font-semibold mb-3" style={{ color: burgundy }}>Add Recurring Activity</h4>
                <div className="grid grid-cols-3 gap-3">
                  <select
                    value={newRecurringItem.class}
                    onChange={(e) => setNewRecurringItem({ ...newRecurringItem, class: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                  >
                    {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                  </select>
                  
                  <select
                    value={newRecurringItem.dayOfWeek}
                    onChange={(e) => setNewRecurringItem({ ...newRecurringItem, dayOfWeek: parseInt(e.target.value) })}
                    className="px-3 py-2 border rounded-lg"
                  >
                    {dayNames.filter((_, i) => i >= 1 && i <= 5).map((day, i) => (
                      <option key={i+1} value={i+1}>{day}</option>
                    ))}
                  </select>
                  
                  <select
                    value={newRecurringItem.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      let icon = '🏃', label = 'PE Day', desc = 'Please wear PE kit';
                      if (type === 'swimming') { icon = '🏊'; label = 'Swimming Lesson'; desc = 'Remember swimwear, towel & goggles'; }
                      setNewRecurringItem({ ...newRecurringItem, type, icon, label, description: desc });
                    }}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="pe">PE Day</option>
                    <option value="swimming">Swimming</option>
                  </select>
                </div>
                <button
                  onClick={() => {
                    onAddRecurringItem(newRecurringItem);
                    alert('✅ Recurring activity added!');
                  }}
                  className="mt-3 px-4 py-2 rounded-lg text-white font-medium text-sm"
                  style={{ backgroundColor: burgundy }}
                >
                  Add Recurring Activity
                </button>
              </div>

              {/* Recurring Items List */}
              <div className="space-y-2">
                {recurringSchedule.map(item => (
                  <div key={item.id} className="bg-white border rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      <span className="text-xl">{item.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${classColors[item.class]?.bg || 'bg-gray-500'} ${classColors[item.class]?.text || 'text-white'}`}>
                            {item.class}
                          </span>
                          <span className="text-sm font-semibold">{dayNames[item.dayOfWeek]}s</span>
                          <span className="text-sm text-gray-600">{item.label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onToggleRecurringItem(item.id)}
                        className={`px-3 py-1 rounded text-xs font-medium ${item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {item.active ? 'Active' : 'Paused'}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this recurring activity?')) {
                            onDeleteRecurringItem(item.id);
                          }
                        }}
                        className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {recurringSchedule.length === 0 && (
                  <p className="text-center text-gray-500 py-4 text-sm">No recurring activities yet</p>
                )}
              </div>
            </div>

            {/* SECTION 2: One-Off Events */}
            <div className="border-2 border-amber-200 rounded-lg p-6 bg-amber-50">
              <h3 className="text-xl font-bold mb-2" style={{ color: burgundy }}>One-Off Events & Overrides</h3>
              <p className="text-sm text-gray-600 mb-4">Special occasions, trips, non-uniform days, early finishes</p>
              
              {/* Add One-Off Event */}
              <div className="bg-white rounded-lg p-4 mb-4 border-2 border-amber-300">
                <h4 className="font-semibold mb-3" style={{ color: burgundy }}>Add One-Off Event</h4>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newScheduleItem.class}
                    onChange={(e) => setNewScheduleItem({ ...newScheduleItem, class: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="Whole School">Whole School</option>
                    {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                  </select>
                  
                  <input
                    type="date"
                    value={newScheduleItem.date}
                    onChange={(e) => setNewScheduleItem({ ...newScheduleItem, date: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                  />
                  
                  <select
                    value={newScheduleItem.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      let icon = '📅', label = '', desc = '';
                      if (type === 'non-uniform') { icon = '👕'; label = 'Non-Uniform Day'; desc = 'Dress comfortably'; }
                      else if (type === 'trip') { icon = '🚌'; label = 'Field Trip'; desc = 'Packed lunch needed'; }
                      else if (type === 'early-finish') { icon = '🕐'; label = 'Early Finish'; desc = 'School ends early'; }
                      setNewScheduleItem({ ...newScheduleItem, type, icon, label, description: desc });
                    }}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="non-uniform">Non-Uniform Day</option>
                    <option value="trip">Field Trip</option>
                    <option value="early-finish">Early Finish</option>
                  </select>
                  
                  <input
                    type="text"
                    value={newScheduleItem.description}
                    onChange={(e) => setNewScheduleItem({ ...newScheduleItem, description: e.target.value })}
                    className="px-3 py-2 border rounded-lg"
                    placeholder="Description"
                  />
                </div>
                <button
                  onClick={() => {
                    if (newScheduleItem.date) {
                      onAddScheduleItem(newScheduleItem);
                      setNewScheduleItem({
                        class: 'Whole School',
                        date: new Date().toISOString().split('T')[0],
                        type: 'non-uniform',
                        label: '',
                        description: '',
                        icon: '👕'
                      });
                      alert('✅ Event added!');
                    }
                  }}
                  className="mt-3 px-4 py-2 rounded-lg text-white font-medium text-sm"
                  style={{ backgroundColor: burgundy }}
                >
                  Add Event
                </button>
              </div>

              {/* One-Off Events List */}
              <div className="space-y-2">
                {dailySchedule.sort((a, b) => new Date(a.date) - new Date(b.date)).map(item => (
                  <div key={item.id} className="bg-white border rounded-lg p-3 flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <span className="text-xl">{item.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            item.class === 'Whole School' 
                              ? 'bg-gray-700 text-white' 
                              : `${classColors[item.class]?.bg || 'bg-gray-500'} ${classColors[item.class]?.text || 'text-white'}`
                          }`}>
                            {item.class}
                          </span>
                          <span className="font-semibold text-sm">{item.label}</span>
                        </div>
                        <p className="text-xs text-gray-600">{item.description}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(item.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this event?')) {
                          onDeleteScheduleItem(item.id);
                        }
                      }}
                      className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {dailySchedule.length === 0 && (
                  <p className="text-center text-gray-500 py-4 text-sm">No one-off events yet</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PrincipalUpdatesView = ({ weeklyMessages, weeklyMessageHearts, onWeeklyMessageHeart, currentUser, burgundy }) => {
  const [expandedId, setExpandedId] = useState(null);

  const hasHearted = (messageId) => weeklyMessageHearts?.some(h => h.messageId === messageId && h.userId === currentUser.email);
  const getHeartCount = (messageId) => weeklyMessageHearts?.filter(h => h.messageId === messageId).length || 0;

  const sortedMessages = Array.isArray(weeklyMessages) 
    ? [...weeklyMessages].sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-3xl font-bold" style={{ color: burgundy }}>Principal's Updates</h2>
        <p className="text-gray-600 mt-2">Weekly messages from Ben, our Principal</p>
      </div>

      <div className="space-y-4">
        {sortedMessages.map((message) => {
          const isExpanded = expandedId === message.id;
          const hearted = hasHearted(message.id);
          const heartCount = getHeartCount(message.id);

          return (
            <div 
              key={message.id} 
              className={`border-2 rounded-lg overflow-hidden ${message.isCurrent ? 'border-amber-400 shadow-lg' : 'border-gray-200'}`}
            >
              {!isExpanded ? (
                /* Collapsed View */
                <div 
                  className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(message.id)}
                >
                  <div className="flex items-start space-x-4">
                    {/* Circular Principal Photo */}
                    <div 
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                      style={{ backgroundColor: burgundy }}
                    >
                      BJ
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold text-lg" style={{ color: burgundy }}>
                          {message.title}
                        </h3>
                        {message.isCurrent && (
                          <span className="px-2 py-0.5 bg-amber-400 text-amber-900 text-xs font-semibold rounded-full">
                            This Week
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">Week of {message.weekOf}</p>
                      <p className="text-sm text-gray-500">Click to read →</p>
                    </div>

                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!hearted) {
                            onWeeklyMessageHeart(message.id);
                          }
                        }}
                        disabled={hearted}
                        className={`p-2 rounded-full transition-colors ${
                          hearted 
                            ? 'bg-red-500 text-white' 
                            : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500'
                        }`}
                      >
                        <Heart className={`h-5 w-5 ${hearted ? 'fill-current' : ''}`} />
                      </button>
                      {heartCount > 0 && (
                        <div className="flex items-center space-x-1 text-gray-400">
                          <Heart className="h-4 w-4" />
                          <span className="text-sm font-medium">{heartCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Expanded View */
                <div>
                  <div className="px-5 py-3" style={{ backgroundColor: burgundy }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-lg font-bold"
                          style={{ color: burgundy }}
                        >
                          BJ
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{message.title}</h3>
                          <p className="text-xs text-white opacity-90">Week of {message.weekOf}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setExpandedId(null)}
                        className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <div className="prose max-w-none">
                      {message.content.split('\n').map((paragraph, idx) => (
                        <p key={idx} className="text-gray-700 mb-3 whitespace-pre-wrap">{paragraph}</p>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between mt-6 pt-4 border-t">
                      <button
                        onClick={() => {
                          if (!hearted) {
                            onWeeklyMessageHeart(message.id);
                          }
                        }}
                        disabled={hearted}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                          hearted 
                            ? 'bg-red-500 text-white' 
                            : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600'
                        }`}
                      >
                        <Heart className={`h-5 w-5 ${hearted ? 'fill-current' : ''}`} />
                        <span className="font-medium">{hearted ? 'Appreciated' : 'Show Appreciation'}</span>
                      </button>
                      
                      {heartCount > 0 && (
                        <div className="flex items-center space-x-2 text-gray-500">
                          <Heart className="h-5 w-5 fill-current text-red-300" />
                          <span className="font-medium">{heartCount} {heartCount === 1 ? 'parent' : 'parents'} appreciated this</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sortedMessages.length === 0 && (
          <p className="text-center text-gray-500 py-12">No updates yet</p>
        )}
      </div>
    </div>
  );
};

const KnowledgeBaseView = ({ knowledgeBase, burgundy, userType, onAddArticle, onUpdateArticle, onDeleteArticle }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedArticle, setExpandedArticle] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);

  const categoryColors = {
    blue: { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', iconBg: 'bg-blue-500' },
    purple: { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800', iconBg: 'bg-purple-500' },
    yellow: { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-800', iconBg: 'bg-yellow-500' },
    green: { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', iconBg: 'bg-green-500' },
    teal: { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-800', iconBg: 'bg-teal-500' },
    red: { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-800', iconBg: 'bg-red-500' },
    orange: { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800', iconBg: 'bg-orange-500' }
  };

  const selectedCat = knowledgeBase.find(cat => cat.id === selectedCategory);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold" style={{ color: burgundy }}>School Information</h2>
          <p className="text-gray-600 mt-1">Everything you need to know about VHPS</p>
        </div>
        {userType === 'admin' && selectedCat && (
          <button
            onClick={() => setEditMode(!editMode)}
            className="px-4 py-2 rounded-lg font-medium text-white"
            style={{ backgroundColor: editMode ? '#dc2626' : burgundy }}
          >
            {editMode ? 'Done Editing' : 'Edit Articles'}
          </button>
        )}
      </div>

      {!selectedCategory ? (
        /* Category Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {knowledgeBase.map(category => {
            const colors = categoryColors[category.color];
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`${colors.bg} ${colors.border} border-2 rounded-lg p-6 text-left hover:shadow-lg transition-shadow`}
              >
                <div className={`${colors.iconBg} w-14 h-14 rounded-full flex items-center justify-center text-3xl mb-3 text-white`}>
                  {category.icon}
                </div>
                <h3 className={`text-lg font-bold mb-2 ${colors.text}`}>{category.category}</h3>
                <p className="text-sm text-gray-600">{category.articles.length} article{category.articles.length !== 1 ? 's' : ''}</p>
              </button>
            );
          })}
        </div>
      ) : (
        /* Category Articles View */
        <div>
          <button
            onClick={() => { setSelectedCategory(null); setExpandedArticle(null); setEditMode(false); }}
            className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <span>←</span>
            <span>Back to categories</span>
          </button>

          <div className={`${categoryColors[selectedCat.color].bg} ${categoryColors[selectedCat.color].border} border-2 rounded-lg p-6 mb-6`}>
            <div className="flex items-center space-x-4">
              <div className={`${categoryColors[selectedCat.color].iconBg} w-16 h-16 rounded-full flex items-center justify-center text-4xl text-white`}>
                {selectedCat.icon}
              </div>
              <div>
                <h3 className="text-2xl font-bold" style={{ color: burgundy }}>{selectedCat.category}</h3>
                <p className="text-sm text-gray-600">{selectedCat.articles.length} articles</p>
              </div>
            </div>
          </div>

          {/* Admin: Add New Article */}
          {editMode && userType === 'admin' && (
            <div className="mb-6 p-4 border-2 border-amber-300 rounded-lg bg-amber-50">
              <h4 className="font-semibold mb-3" style={{ color: burgundy }}>Add New Article</h4>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Article Title"
                  className="w-full px-3 py-2 border rounded-lg"
                  id="new-article-title"
                />
                <textarea
                  placeholder="Article Content (use **bold** for headings, bullet points with •)"
                  className="w-full px-3 py-2 border rounded-lg h-32"
                  id="new-article-content"
                />
                <button
                  onClick={() => {
                    const title = document.getElementById('new-article-title').value;
                    const content = document.getElementById('new-article-content').value;
                    if (title && content) {
                      onAddArticle(selectedCat.id, { title, content });
                      document.getElementById('new-article-title').value = '';
                      document.getElementById('new-article-content').value = '';
                      alert('✅ Article added!');
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: burgundy }}
                >
                  Add Article
                </button>
              </div>
            </div>
          )}

          {/* Articles List */}
          <div className="space-y-3">
            {selectedCat.articles.map(article => {
              const isExpanded = expandedArticle === article.id;
              const isEditing = editingArticle === article.id;

              return (
                <div key={article.id} className="border-2 rounded-lg overflow-hidden">
                  {!isExpanded ? (
                    /* Collapsed */
                    <button
                      onClick={() => setExpandedArticle(article.id)}
                      className="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg" style={{ color: burgundy }}>{article.title}</h4>
                        <p className="text-xs text-gray-500 mt-1">Last updated: {new Date(article.lastUpdated).toLocaleDateString('en-GB')}</p>
                      </div>
                      <span className="text-gray-400">→</span>
                    </button>
                  ) : (
                    /* Expanded */
                    <div>
                      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: burgundy }}>
                        <h4 className="font-semibold text-white text-lg">{article.title}</h4>
                        <button onClick={() => setExpandedArticle(null)} className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="p-6">
                        {!isEditing ? (
                          <div className="prose max-w-none">
                            {article.content.split('\n').map((para, idx) => {
                              // Bold text handling
                              if (para.includes('**')) {
                                const parts = para.split('**');
                                return (
                                  <p key={idx} className="mb-3">
                                    {parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
                                  </p>
                                );
                              }
                              // Bullet points
                              if (para.trim().startsWith('•')) {
                                return <li key={idx} className="ml-4 mb-2">{para.trim().substring(1).trim()}</li>;
                              }
                              return para.trim() ? <p key={idx} className="mb-3 whitespace-pre-wrap">{para}</p> : null;
                            })}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <input
                              type="text"
                              defaultValue={article.title}
                              className="w-full px-3 py-2 border rounded-lg font-semibold"
                              id={`edit-title-${article.id}`}
                            />
                            <textarea
                              defaultValue={article.content}
                              className="w-full px-3 py-2 border rounded-lg h-64"
                              id={`edit-content-${article.id}`}
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={() => {
                                  const title = document.getElementById(`edit-title-${article.id}`).value;
                                  const content = document.getElementById(`edit-content-${article.id}`).value;
                                  onUpdateArticle(selectedCat.id, article.id, { title, content });
                                  setEditingArticle(null);
                                  alert('✅ Article updated!');
                                }}
                                className="px-4 py-2 rounded-lg text-white font-medium"
                                style={{ backgroundColor: burgundy }}
                              >
                                Save Changes
                              </button>
                              <button
                                onClick={() => setEditingArticle(null)}
                                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {editMode && !isEditing && (
                          <div className="flex space-x-2 mt-4 pt-4 border-t">
                            <button
                              onClick={() => setEditingArticle(article.id)}
                              className="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium text-sm"
                            >
                              Edit Article
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('Delete this article?')) {
                                  onDeleteArticle(selectedCat.id, article.id);
                                  setExpandedArticle(null);
                                }
                              }}
                              className="px-4 py-2 rounded-lg bg-red-100 text-red-700 font-medium text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        )}

                        <p className="text-xs text-gray-400 mt-4">Last updated: {new Date(article.lastUpdated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const ResourcesView = ({ resources, burgundy }) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <h2 className="text-2xl font-bold mb-6" style={{ color: burgundy }}>Files & Policies</h2>
    {resources.map(r => (
      <div key={r.id} className="border rounded-lg p-4 mb-3 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <FileText className="h-8 w-8" style={{ color: burgundy }} />
          <div>
            <h3 className="font-semibold">{r.name}</h3>
            <p className="text-sm text-gray-500">{r.type}</p>
          </div>
        </div>
        <button className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: burgundy }}>Download</button>
      </div>
    ))}
  </div>
);

const TermDatesView = ({ termDates, burgundy, gold, userType, onAddTermDate, onUpdateTermDate, onDeleteTermDate }) => {
  const [editMode, setEditMode] = useState(false);
  const [newDate, setNewDate] = useState({
    term: 1,
    termName: 'Term 1 (Winter Term)',
    label: '',
    sublabel: '',
    date: '',
    endDate: '',
    type: 'term-start',
    color: 'burgundy'
  });

  // Color schemes for different types
  const colorSchemes = {
    'burgundy': { bg: 'bg-[#7f0029]', border: 'border-[#7f0029]', text: 'text-white' },
    'blue': { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-white' },
    'green': { bg: 'bg-green-600', border: 'border-green-600', text: 'text-white' },
    'purple': { bg: 'bg-purple-600', border: 'border-purple-600', text: 'text-white' },
    'orange': { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-white' }
  };

  const typeLabels = {
    'term-start': 'Term Start',
    'term-end': 'Term End',
    'half-term': 'Half Term Break',
    'public-holiday': 'Public Holiday',
    'induction': 'Induction Day'
  };

  // Group dates by term
  const term1Dates = termDates.filter(d => d.term === 1);
  const term2Dates = termDates.filter(d => d.term === 2);
  const term3Dates = termDates.filter(d => d.term === 3);

  const formatDateRange = (date, endDate) => {
    const start = new Date(date);
    const startFormatted = start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    
    if (endDate) {
      const end = new Date(endDate);
      const endFormatted = end.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      return `${startFormatted} - ${endFormatted}`;
    }
    return startFormatted;
  };

  const renderTermSection = (termNum, termDates, termTitle) => (
    <div className="mb-8">
      <div className="rounded-lg overflow-hidden border">
        {/* Thin Burgundy Strip at Top - matching message/event style */}
        <div className="px-6 py-2" style={{ backgroundColor: burgundy }}>
          <h3 className="text-sm font-semibold text-white">{termTitle}</h3>
        </div>

        {/* Term Dates */}
        <div className="bg-white">
          {termDates.map((item, idx) => {
            const scheme = colorSchemes[item.color] || colorSchemes.burgundy;
            return (
              <div 
                key={item.id} 
                className={`flex items-center justify-between px-6 py-4 ${idx !== termDates.length - 1 ? 'border-b' : ''}`}
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-1">
                    <div className={`w-3 h-3 rounded-full ${scheme.bg}`}></div>
                    <h4 className="font-semibold text-gray-900">{item.label}</h4>
                  </div>
                  {item.sublabel && (
                    <p className="text-sm text-gray-600 ml-6 italic">{item.sublabel}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-gray-700 font-medium">{formatDateRange(item.date, item.endDate)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold" style={{ color: burgundy }}>Parent School Calendar 2025/26</h2>
          <p className="text-sm text-gray-600 mt-1">Total: 182 school days</p>
        </div>
        {userType === 'admin' && (
          <button
            onClick={() => setEditMode(!editMode)}
            className="px-4 py-2 rounded-lg font-medium"
            style={{ backgroundColor: editMode ? '#dc2626' : burgundy, color: 'white' }}
          >
            {editMode ? 'Done Editing' : 'Manage Dates'}
          </button>
        )}
      </div>

      {/* Admin Edit Mode */}
      {editMode && userType === 'admin' && (
        <div className="mb-8 p-6 border-2 border-amber-300 rounded-lg bg-amber-50">
          <h3 className="text-lg font-semibold mb-4" style={{ color: burgundy }}>Add New Date</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Term</label>
              <select
                value={newDate.term}
                onChange={(e) => setNewDate({ ...newDate, term: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value={1}>Term 1 (Winter Term)</option>
                <option value={2}>Term 2</option>
                <option value={3}>Term 3</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={newDate.type}
                onChange={(e) => setNewDate({ ...newDate, type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Label</label>
              <input
                type="text"
                value={newDate.label}
                onChange={(e) => setNewDate({ ...newDate, label: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., Term 1 starts"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sublabel (optional)</label>
              <input
                type="text"
                value={newDate.sublabel}
                onChange={(e) => setNewDate({ ...newDate, sublabel: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., Public holiday"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={newDate.date}
                onChange={(e) => setNewDate({ ...newDate, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date (optional)</label>
              <input
                type="date"
                value={newDate.endDate}
                onChange={(e) => setNewDate({ ...newDate, endDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <select
                value={newDate.color}
                onChange={(e) => setNewDate({ ...newDate, color: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="burgundy">Burgundy (Term Dates)</option>
                <option value="blue">Blue (Half Term)</option>
                <option value="green">Green (Public Holiday)</option>
                <option value="purple">Purple (Special)</option>
                <option value="orange">Orange (Other)</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => {
              if (newDate.label && newDate.date) {
                onAddTermDate(newDate);
                setNewDate({
                  term: 1,
                  termName: 'Term 1 (Winter Term)',
                  label: '',
                  sublabel: '',
                  date: '',
                  endDate: '',
                  type: 'term-start',
                  color: 'burgundy'
                });
                alert('✅ Date added successfully!');
              }
            }}
            className="mt-4 px-6 py-2 rounded-lg text-white font-medium"
            style={{ backgroundColor: burgundy }}
          >
            Add Date
          </button>
        </div>
      )}

      {/* Calendar Display */}
      {renderTermSection(1, term1Dates, 'Term 1 (Winter Term)')}
      {renderTermSection(2, term2Dates, 'Term 2')}
      {renderTermSection(3, term3Dates, 'Term 3')}

      {/* Footer Note */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600 text-center">
          * Public holiday dates are subject to confirmation by the government of the UAE
        </p>
      </div>
    </div>
  );
};

export default VHPSCompleteApp;