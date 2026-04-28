import { sendEmail } from './email.js'

interface BookingDetails {
  teacherName: string
  childName: string
  date: string
  time: string
  location: string
  schoolName: string
}

function formatDateForEmail(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function buildEmailHtml(schoolName: string, heading: string, bodyContent: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="color: #111827; font-size: 24px; margin: 0 0 24px 0; text-align: center;">
      ${schoolName}
    </h1>
    <h2 style="color: #374151; font-size: 18px; margin: 0 0 16px 0;">
      ${heading}
    </h2>
    ${bodyContent}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
      Powered by Wasil
    </p>
  </div>
</body>
</html>`
}

function detailsBlock(details: BookingDetails): string {
  return `
    <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Teacher:</strong> ${details.teacherName}</p>
      <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Child:</strong> ${details.childName}</p>
      <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Date:</strong> ${formatDateForEmail(details.date)}</p>
      <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Time:</strong> ${details.time}</p>
      <p style="color: #374151; font-size: 14px; margin: 0;"><strong>Location:</strong> ${details.location}</p>
    </div>`
}

export async function sendBookingConfirmationToParent(
  to: string,
  details: BookingDetails,
): Promise<void> {
  const html = buildEmailHtml(
    details.schoolName,
    'Booking Confirmed',
    `<p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">
      Your parent consultation appointment has been confirmed.
    </p>` + detailsBlock(details),
  )

  await sendEmail({
    to,
    subject: `Booking Confirmed — ${details.teacherName}`,
    html,
    text: `Booking Confirmed\n\nTeacher: ${details.teacherName}\nChild: ${details.childName}\nDate: ${formatDateForEmail(details.date)}\nTime: ${details.time}\nLocation: ${details.location}`,
  })
}

export async function sendBookingNotificationToTeacher(
  to: string,
  details: BookingDetails & { parentName: string },
): Promise<void> {
  const html = buildEmailHtml(
    details.schoolName,
    'New Consultation Booking',
    `<p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">
      ${details.parentName} has booked a consultation with you.
    </p>` + detailsBlock(details),
  )

  await sendEmail({
    to,
    subject: `New Booking — ${details.parentName} (${details.childName})`,
    html,
    text: `New Booking\n\nParent: ${details.parentName}\nChild: ${details.childName}\nDate: ${formatDateForEmail(details.date)}\nTime: ${details.time}\nLocation: ${details.location}`,
  })
}

export async function sendCancellationToParent(
  to: string,
  details: BookingDetails,
): Promise<void> {
  const html = buildEmailHtml(
    details.schoolName,
    'Booking Cancelled',
    `<p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">
      Your consultation appointment has been cancelled.
    </p>` + detailsBlock(details),
  )

  await sendEmail({
    to,
    subject: `Booking Cancelled — ${details.teacherName}`,
    html,
    text: `Booking Cancelled\n\nTeacher: ${details.teacherName}\nChild: ${details.childName}\nDate: ${formatDateForEmail(details.date)}\nTime: ${details.time}`,
  })
}

export async function sendCancellationToTeacher(
  to: string,
  details: BookingDetails & { parentName: string },
): Promise<void> {
  const html = buildEmailHtml(
    details.schoolName,
    'Booking Cancelled',
    `<p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">
      ${details.parentName} has cancelled their consultation booking. The slot is now available.
    </p>` + detailsBlock(details),
  )

  await sendEmail({
    to,
    subject: `Booking Cancelled — ${details.parentName} (${details.childName})`,
    html,
    text: `Booking Cancelled\n\nParent: ${details.parentName}\nChild: ${details.childName}\nDate: ${formatDateForEmail(details.date)}\nTime: ${details.time}`,
  })
}

export async function sendReminderToParent(
  to: string,
  details: BookingDetails,
): Promise<void> {
  const html = buildEmailHtml(
    details.schoolName,
    'Consultation Tomorrow',
    `<p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 16px 0;">
      This is a reminder that you have a consultation appointment tomorrow.
    </p>` + detailsBlock(details),
  )

  await sendEmail({
    to,
    subject: `Reminder: Consultation Tomorrow — ${details.teacherName}`,
    html,
    text: `Reminder: Consultation Tomorrow\n\nTeacher: ${details.teacherName}\nChild: ${details.childName}\nDate: ${formatDateForEmail(details.date)}\nTime: ${details.time}\nLocation: ${details.location}`,
  })
}
