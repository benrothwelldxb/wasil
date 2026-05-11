import React from 'react'
import { useApi, api } from '@wasil/shared'
import type { StudentReport } from '@wasil/shared'
import { FileText, Download } from 'lucide-react'

export function ReportCardsPage() {
  const { data: reports, isLoading } = useApi<StudentReport[]>(
    () => api.students.myChildrenReports(),
    []
  )

  // Group by student
  const grouped = (reports || []).reduce((acc, r) => {
    if (!acc[r.studentId]) acc[r.studentId] = { studentName: r.studentName, className: r.className, reports: [] }
    acc[r.studentId].reports.push(r)
    return acc
  }, {} as Record<string, { studentName: string; className: string; reports: StudentReport[] }>)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>Report Cards</h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          Download your child's school reports
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-[22px] p-5 space-y-2" style={{ border: '1px solid #F0E4E6' }}>
              <div className="skeleton-pulse h-4 w-1/3 rounded" />
              <div className="skeleton-pulse h-6 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-[22px] p-12 text-center" style={{ border: '1.5px solid #F0E4E6' }}>
          <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: '#D8CDD0' }} />
          <p className="font-medium" style={{ color: '#A8929A' }}>No report cards available yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([studentId, group]) => (
            <div key={studentId} className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1.5px solid #F0E4E6' }}>
              <div className="px-5 py-3" style={{ backgroundColor: '#FAF8F6', borderBottom: '1px solid #F0E4E6' }}>
                <h3 className="text-sm font-bold" style={{ color: '#2D2225' }}>{group.studentName}</h3>
                <p className="text-xs" style={{ color: '#7A6469' }}>{group.className}</p>
              </div>
              <div className="px-5 py-3 space-y-3">
                {group.reports.map(report => (
                  <a
                    key={report.id}
                    href={report.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                    style={{ border: '1px solid #F0E4E6' }}
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FEF2F2' }}>
                      <FileText className="w-5 h-5" style={{ color: '#C4506E' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: '#2D2225' }}>
                        {report.reportPeriod || (report.reportType === 'REPORT_CARD' ? 'Report Card' : report.reportType)}
                      </p>
                      {report.reportPeriod && (
                        <p className="text-xs" style={{ color: '#7A6469' }}>{report.reportPeriod}</p>
                      )}
                      {report.academicYear && (
                        <p className="text-xs" style={{ color: '#A8929A' }}>{report.academicYear}</p>
                      )}
                    </div>
                    <Download className="w-4 h-4 shrink-0" style={{ color: '#A8929A' }} />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
