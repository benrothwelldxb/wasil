export function serializeUser(user: any, options?: { includeTwoFactor?: boolean }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    schoolId: user.schoolId,
    avatarUrl: user.avatarUrl,
    preferredLanguage: user.preferredLanguage,
    ...(options?.includeTwoFactor !== false && {
      twoFactorEnabled: user.twoFactorEnabled,
    }),
    children: user.children?.map((child: any) => ({
      id: child.id,
      name: child.name,
      classId: child.classId,
      className: child.class?.name || child.className,
      teacherName: child.class?.assignedStaff?.[0]?.user?.name || null,
    })) || [],
    studentLinks: user.studentLinks?.map((link: any) => ({
      studentId: link.student?.id || link.studentId,
      studentName: link.student ? `${link.student.firstName} ${link.student.lastName}` : link.studentName,
      className: link.student?.class?.name || link.className,
      teacherName: link.student?.class?.assignedStaff?.[0]?.user?.name || null,
    })) || [],
    school: user.school ? {
      id: user.school.id,
      name: user.school.name,
      shortName: user.school.shortName,
      city: user.school.city,
      academicYear: user.school.academicYear,
      brandColor: user.school.brandColor,
      accentColor: user.school.accentColor,
      tagline: user.school.tagline,
      logoUrl: user.school.logoUrl,
      logoIconUrl: user.school.logoIconUrl,
      paymentUrl: user.school.paymentUrl,
    } : undefined,
  }
}
