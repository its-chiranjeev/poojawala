import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Booking, COMPLAINT_STATUS, Payment, PurohitProfile, User, USER_ROLE, COMPLAINT_CATEGORY, } from '@poojawala/entities';
import { ComplaintRepository } from '@poojawala/repositories';
import { CreateComplaintDto, ComplaintQueryDto, UpdateComplaintStatusDto, } from '@poojawala/dtos';
import { S3Service } from '@poojawala/s3';

@Injectable()
export class ComplaintService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(PurohitProfile)
    private readonly purohitProfileRepository: Repository<PurohitProfile>,
    private readonly complaintRepository: ComplaintRepository,
    private readonly s3Service: S3Service,
  ) {}

  async createComplaint(
    user: User,
    dto: CreateComplaintDto,
    files: Express.Multer.File[],
  ) {
    this.validateComplaintFiles(files);

    if (
      [USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT].includes(user.role) &&
      !dto.bookingId
    ) {
      throw new BadRequestException('Booking ID is required');
    }

    const booking = dto.bookingId
      ? await this.findBookingForComplaint(dto.bookingId)
      : null;

    if (booking) {
      await this.validateBookingComplaintAccess(user, booking);
    }

    if (booking) {
      await this.validateDuplicateComplaint(booking.id, user.id, dto.category);
    }

    const complaintNumber = await this.generateUniqueComplaintNumber();

    const uploadedFiles: Array<{
      key: string;
      url: string;
    }> = [];

    try {
      for (const file of files || []) {
        const extension = this.getEvidenceExtension(file.originalname);

        const key = `complaints/${complaintNumber}/${crypto.randomUUID()}.${extension}`;

        const uploadedUrl = await this.s3Service.uploadFile(
          key,
          file.buffer,
          file.mimetype,
        );

        uploadedFiles.push({
          key,
          url: uploadedUrl,
        });
      }

      const complaint = this.complaintRepository.create({
        complaintNumber,
        bookingId: booking?.id,
        raisedById: user.id,

        category: dto.category,
        subject: dto.subject?.trim(),
        description: dto.description.trim(),
        evidenceUrls: uploadedFiles.map(({ url }) => url),
        status: COMPLAINT_STATUS.OPEN,
      });

      const savedComplaint = await this.complaintRepository.save(complaint);

      if (savedComplaint.evidenceUrls?.length) {
        const downloadUrls = await Promise.all(
          savedComplaint.evidenceUrls.map((url) =>
            this.s3Service.getAttachmentDownloadUrl(url).catch(() => url)
          )
        );
        savedComplaint.evidenceUrls = downloadUrls;
      }

      return {
        message: 'Complaint created successfully',
        data: savedComplaint,
      };
    } catch (error) {
      await this.deleteUploadedEvidence(uploadedFiles);

      throw error;
    }
  }

  private validateComplaintFiles(files: Express.Multer.File[]): void {
    if (!files?.length) {
      return;
    }

    if (files.length > 5) {
      throw new BadRequestException('A maximum of 5 evidence files is allowed');
    }

    files.forEach((file) => this.validateEvidenceFile(file));
  }

  private async validateDuplicateComplaint(
    bookingId: number,
    raisedById: number,
    category: COMPLAINT_CATEGORY,
  ): Promise<void> {
    const duplicateComplaintExists =
      await this.complaintRepository.hasActiveComplaintForBooking(
        bookingId,
        raisedById,
        category,
      );

    if (duplicateComplaintExists) {
      throw new ConflictException(
        'An active complaint already exists for this booking and category',
      );
    }
  }

  private getEvidenceExtension(originalName: string): string {
    const extension = originalName.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
    if (!extension || !allowedExtensions.includes(extension)) {
      throw new BadRequestException('Invalid evidence file extension');
    }

    return extension;
  }

  private async deleteUploadedEvidence(
    uploadedFiles: Array<{
      key: string;
      url: string;
    }>,
  ): Promise<void> {
    await Promise.allSettled(
      uploadedFiles.map(({ key }) => this.s3Service.deleteFile(key)),
    );
  }

  private async validatePurohitComplaintAccess(
    user: User,
    booking: Booking,
  ): Promise<void> {
    const purohitProfile = await this.purohitProfileRepository.findOne({
      where: {
        userId: user.id,
      },
    });

    if (!purohitProfile) {
      throw new NotFoundException('Purohit profile not found');
    }

    if (booking.purohitId !== purohitProfile.id) {
      throw new ForbiddenException(
        'You cannot raise a complaint for this booking',
      );
    }
  }

  private async validateBookingComplaintAccess(
    user: User,
    booking: Booking,
  ): Promise<void> {
    switch (user.role) {
      case USER_ROLE.CUSTOMER:
        this.validateCustomerComplaintAccess(user, booking);
        break;

      case USER_ROLE.PUROHIT:
        await this.validatePurohitComplaintAccess(user, booking);
        break;

      default:
        throw new ForbiddenException(
          'Only customers and purohits can raise complaints',
        );
    }
  }

  private validateEvidenceFile(file: Express.Multer.File): void {
    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
    const maximumSize = 5 * 1024 * 1024;

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Only JPG, PNG, WEBP and PDF evidence files are allowed',
      );
    }

    if (file.size > maximumSize) {
      throw new BadRequestException(
        'Each evidence file must be smaller than 5 MB',
      );
    }
  }

  private validateCustomerComplaintAccess(
    user: User,
    booking: Booking,
  ): void {
    if (booking.customerId !== user.id) {
      throw new ForbiddenException(
        'You cannot raise a complaint for this booking',
      );
    }
  }

  private async findBookingForComplaint(bookingId: number): Promise<Booking> {
    const booking = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.customer', 'customer')
      .leftJoinAndSelect('booking.purohit', 'purohit')
      .leftJoinAndSelect('purohit.user', 'purohitUser')
      .where('booking.id = :bookingId', {
        bookingId,
      })
      .getOne();

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  private generateComplaintNumber(): string {
    const timestamp = Date.now().toString().slice(-10);
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    return `CMP${timestamp}${randomNumber}`;
  }

  private async generateUniqueComplaintNumber(): Promise<string> {
    const maximumAttempts = 5;

    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
      const complaintNumber = this.generateComplaintNumber();

      const existingComplaint =
        await this.complaintRepository.findByComplaintNumber(complaintNumber);

      if (!existingComplaint) {
        return complaintNumber;
      }
    }

    throw new ConflictException(
      'Unable to generate a unique complaint number. Please try again',
    );
  }

  async updateComplaintStatus(
    admin: User,
    complaintId: number,
    dto: UpdateComplaintStatusDto,
  ) {
    const complaint =
      await this.complaintRepository.findComplaintById(complaintId);

    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }

    if (complaint.status === dto.status) {
      throw new BadRequestException(`Complaint is already ${dto.status}`);
    }

    this.validateComplaintStatusTransition(complaint.status, dto.status);

    const resolvedStatuses = [
      COMPLAINT_STATUS.RESOLVED,
      COMPLAINT_STATUS.CLOSED,
      COMPLAINT_STATUS.REJECTED,
    ];
    if (dto.status === COMPLAINT_STATUS.REJECTED && !dto.resolutionNotes?.trim()) {
      throw new BadRequestException('Rejection message (resolution notes) is required when rejecting a complaint');
    }

    if (dto.status === COMPLAINT_STATUS.RESOLVED && !dto.resolutionNotes?.trim()) {
      throw new BadRequestException('Resolution notes are required when resolving a complaint');
    }

    complaint.status = dto.status;

    if (dto.resolutionNotes) {
      complaint.resolutionNotes = dto.resolutionNotes.trim();
    }

    if (resolvedStatuses.includes(dto.status)) {
      complaint.resolvedById = admin.id;
      complaint.resolvedAt = new Date();
    }

    const updatedComplaint = await this.complaintRepository.save(complaint);

    return {
      message: 'Complaint status updated successfully',
      data: updatedComplaint,
    };
  }

  private validateComplaintStatusTransition(
    currentStatus: COMPLAINT_STATUS,
    nextStatus: COMPLAINT_STATUS,
  ): void {
    const allowedTransitions: Record<COMPLAINT_STATUS, COMPLAINT_STATUS[]> = {
      [COMPLAINT_STATUS.OPEN]: [
        COMPLAINT_STATUS.UNDER_REVIEW,
        COMPLAINT_STATUS.RESOLVED,
        COMPLAINT_STATUS.REJECTED,

      ],

      [COMPLAINT_STATUS.UNDER_REVIEW]: [
        COMPLAINT_STATUS.RESOLVED,
        COMPLAINT_STATUS.REJECTED,
      ],

      [COMPLAINT_STATUS.RESOLVED]: [COMPLAINT_STATUS.CLOSED],
      [COMPLAINT_STATUS.REJECTED]: [COMPLAINT_STATUS.CLOSED],
      [COMPLAINT_STATUS.CLOSED]: [],
    };

    const allowed = allowedTransitions[currentStatus] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Complaint status cannot be changed from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  async getComplaints(user: User, query: ComplaintQueryDto) {
    const raisedById = user.role === USER_ROLE.ADMIN ? undefined : user.id;
    const { complaints, total } = await this.complaintRepository.findComplaints(
      {
        page: query.page,
        limit: query.limit,
        status: query.status,
        category: query.category,
        search: query.search,
        raisedById,
      },
    );
    const complaintsWithUrls = await Promise.all(
      complaints.map(async (complaint) => {
        if (complaint.booking?.service?.iconUrl) {
          try {
            const downloadUrl = await this.s3Service.getAttachmentDownloadUrl(
              complaint.booking.service.iconUrl,
            );
            complaint.booking.service.iconUrl = downloadUrl;
          } catch (error) {
            // keep the original url if fetching download url fails
          }
        }

        if (complaint.evidenceUrls?.length) {
          const downloadUrls = await Promise.all(
            complaint.evidenceUrls.map((url) =>
              this.s3Service.getAttachmentDownloadUrl(url).catch(() => url)
            )
          );
          complaint.evidenceUrls = downloadUrls;
        }

        return complaint;
      }),
    );

    return {
      message: 'Complaints retrieved successfully',
      data: complaintsWithUrls,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getComplaintById(user: User, complaintId: number) {
    const complaint =
      await this.complaintRepository.findComplaintById(complaintId);

    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }

    const canAccess =
      user.role === USER_ROLE.ADMIN ||
      complaint.raisedById === user.id;

    if (!canAccess) {
      throw new ForbiddenException('You cannot access this complaint');
    }

    if (complaint.booking?.service?.iconUrl) {
      try {
        const downloadUrl = await this.s3Service.getAttachmentDownloadUrl(
          complaint.booking.service.iconUrl,
        );
        complaint.booking.service.iconUrl = downloadUrl;
      } catch (error) {
        // keep original url
      }
    }

    if (complaint.evidenceUrls?.length) {
      const downloadUrls = await Promise.all(
        complaint.evidenceUrls.map((url) =>
          this.s3Service.getAttachmentDownloadUrl(url).catch(() => url)
        )
      );
      complaint.evidenceUrls = downloadUrls;
    }

    return complaint;
  }

  async deleteComplaint(complaintId: number) {
    const complaint =
      await this.complaintRepository.findComplaintById(complaintId);

    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }

    const deletableStatuses: COMPLAINT_STATUS[] = [
      COMPLAINT_STATUS.RESOLVED,
      COMPLAINT_STATUS.REJECTED,
      COMPLAINT_STATUS.CLOSED,
    ];

    if (!deletableStatuses.includes(complaint.status)) {
      throw new BadRequestException(
        'Only resolved or closed complaints can be deleted',
      );
    }

    await this.complaintRepository.softDeleteComplaint(complaintId);

    return {
      message: 'Complaint deleted successfully',
    };
  }

  async restoreComplaint(complaintId: number) {
    const complaint =
      await this.complaintRepository.findDeletedComplaintById(complaintId);

    if (!complaint) {
      throw new NotFoundException('Deleted complaint not found');
    }

    await this.complaintRepository.restoreComplaint(complaintId);

    return {
      message: 'Complaint restored successfully',
    };
  }
}
